/**
 * Voice Controller
 *
 * Exposes the Voice AI service via REST endpoints consumed by:
 *   • The Voice Gateway webhook (transcript turns during a live call)
 *   • The BullMQ voiceCall worker (call completion callback)
 *   • Frontend / officers (call history, manual triggers)
 *
 * Webhook routes use VOICE_WEBHOOK_SECRET header auth rather than JWT
 * because they are called by the external Voice Gateway, not the browser.
 */

const { z }   = require('zod');
const prisma  = require('../config/prisma');
const voiceAi = require('../services/voiceAi.service');
const { success, failure, paginated } = require('../utils/response');
const { voiceCallQueue } = require('../queues/queues');

// ── Webhook secret auth ───────────────────────────────────────────────────────

function verifyWebhookSecret(req) {
  const secret = process.env.VOICE_WEBHOOK_SECRET;
  if (!secret) return true; // allow-all in dev when not configured
  return req.headers['x-webhook-secret'] === secret;
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const transcriptSchema = z.object({
  callId:    z.string().regex(/^\d+$/),
  elderlyId: z.string().regex(/^\d+$/),
  transcript:z.string().min(1),
  // Conversation history for context; each item is a prior {role, content} turn
  history:   z.array(z.object({ role: z.string(), content: z.string() })).optional(),
});

const callCompleteSchema = z.object({
  callId:    z.string().regex(/^\d+$/),
  elderlyId: z.string().regex(/^\d+$/),
  callStatus:z.enum(['SUCCESS', 'FAILED', 'NO_ANSWER', 'BUSY']).optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  recordingUrl:    z.string().url().optional(),
});

const scheduleCallSchema = z.object({
  elderlyId: z.string().regex(/^\d+$/),
  callType:  z.enum(['MEDICATION', 'HEALTH_CHECK', 'APPOINTMENT', 'EMERGENCY']).default('HEALTH_CHECK'),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});

// ── POST /api/v1/voice/transcript ─────────────────────────────────────────────
// Voice Gateway webhook: receives one STT transcript turn, returns TTS text.

const receiveTranscript = async (req, res) => {
  if (!verifyWebhookSecret(req)) {
    return failure(res, 'UNAUTHORIZED', 'Invalid webhook secret', 401);
  }

  const parsed = transcriptSchema.safeParse(req.body);
  if (!parsed.success) {
    return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);
  }

  const { callId, elderlyId, transcript, history } = parsed.data;

  try {
    const result = await voiceAi.processTurn({ callId, elderlyId, transcript, history: history ?? [] });

    return success(res, {
      aiText:      result.aiText,
      isEmergency: result.isEmergency,
    });
  } catch (err) {
    console.error('[VoiceController.receiveTranscript]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to process transcript', 500);
  }
};

// ── POST /api/v1/voice/call-complete ─────────────────────────────────────────
// Voice Gateway webhook: signals a call has ended. Triggers analysis pipeline.

const callComplete = async (req, res) => {
  if (!verifyWebhookSecret(req)) {
    return failure(res, 'UNAUTHORIZED', 'Invalid webhook secret', 401);
  }

  const parsed = callCompleteSchema.safeParse(req.body);
  if (!parsed.success) {
    return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);
  }

  const { callId, elderlyId, callStatus, durationSeconds, recordingUrl } = parsed.data;

  try {
    // Update call status in DB
    if (callStatus) {
      await prisma.call.updateMany({
        where: { id: BigInt(callId) },
        data: {
          callStatus,
          durationSeconds: durationSeconds ?? null,
          recordingUrl:    recordingUrl    ?? null,
          endedAt:         new Date(),
        },
      });
    }

    // Run analysis asynchronously — respond immediately to the gateway
    voiceAi
      .concludeCall(callId, elderlyId)
      .catch((err) => console.error('[VoiceController.callComplete] Analysis failed:', err.message));

    return success(res, { message: 'Call completion received' });
  } catch (err) {
    console.error('[VoiceController.callComplete]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to process call completion', 500);
  }
};

// ── POST /api/v1/voice/call — Manual call trigger (officers / scheduler) ──────

const scheduleCall = async (req, res) => {
  const parsed = scheduleCallSchema.safeParse(req.body);
  if (!parsed.success) {
    return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);
  }

  const { elderlyId, callType, scheduledAt } = parsed.data;
  const orgId = req.user.organizationId;

  try {
    // Verify elderly belongs to caller's org (AP-01)
    const elderly = await prisma.elderly.findFirst({
      where:  { id: BigInt(elderlyId), organizationId: BigInt(orgId) },
      select: { id: true, phone: true, firstName: true },
    });

    if (!elderly) return failure(res, 'NOT_FOUND', 'Elderly not found', 404);
    if (!elderly.phone) return failure(res, 'MISSING_PHONE', 'Elderly has no phone number on record', 422);

    const delay = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : 0;

    const job = await voiceCallQueue.add(
      'manual-call',
      {
        elderlyId:      elderlyId.toString(),
        phoneNumber:    elderly.phone,
        callType,
        organizationId: orgId.toString(),
      },
      { delay }
    );

    return success(res, {
      jobId:    job.id,
      elderlyId,
      callType,
      scheduledAt: scheduledAt ?? new Date().toISOString(),
    }, 202);
  } catch (err) {
    console.error('[VoiceController.scheduleCall]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to schedule call', 500);
  }
};

// ── GET /api/v1/calls — Call history ─────────────────────────────────────────

const listCalls = async (req, res) => {
  const { elderlyId, page = '1', limit = '20' } = req.query;
  const orgId    = BigInt(req.user.organizationId);
  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip     = (pageNum - 1) * limitNum;

  const where = {
    elderly: { organizationId: orgId },
    ...(elderlyId ? { elderlyId: BigInt(elderlyId) } : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.call.findMany({
        where,
        skip,
        take:    limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          elderly: { select: { firstName: true, lastName: true } },
          _count:  { select: { callTranscripts: true } },
        },
      }),
      prisma.call.count({ where }),
    ]);

    return paginated(res, items, { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[VoiceController.listCalls]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch calls', 500);
  }
};

// ── GET /api/v1/calls/:id/transcripts ────────────────────────────────────────

const getTranscripts = async (req, res) => {
  const callId = req.params.id;
  if (!/^\d+$/.test(callId)) return failure(res, 'VALIDATION_ERROR', 'Invalid call ID', 400);

  try {
    // AP-01: verify call's elderly is in caller's org
    const call = await prisma.call.findFirst({
      where:   { id: BigInt(callId), elderly: { organizationId: BigInt(req.user.organizationId) } },
      include: { callTranscripts: { orderBy: { createdAt: 'asc' } } },
    });

    if (!call) return failure(res, 'NOT_FOUND', 'Call not found', 404);

    return success(res, { call, transcripts: call.callTranscripts });
  } catch (err) {
    console.error('[VoiceController.getTranscripts]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch transcripts', 500);
  }
};

// ── GET /api/v1/risk-scores/:elderlyId ───────────────────────────────────────

const getRiskScores = async (req, res) => {
  const { elderlyId } = req.params;
  if (!/^\d+$/.test(elderlyId)) return failure(res, 'VALIDATION_ERROR', 'Invalid elderly ID', 400);

  try {
    const elderly = await prisma.elderly.findFirst({
      where:  { id: BigInt(elderlyId), organizationId: BigInt(req.user.organizationId) },
      select: { id: true },
    });
    if (!elderly) return failure(res, 'NOT_FOUND', 'Elderly not found', 404);

    const scores = await prisma.riskScore.findMany({
      where:   { elderlyId: BigInt(elderlyId) },
      orderBy: { calculatedAt: 'desc' },
      take:    10,
    });

    return success(res, scores);
  } catch (err) {
    console.error('[VoiceController.getRiskScores]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch risk scores', 500);
  }
};

// ── POST /api/v1/risk/calculate ───────────────────────────────────────────────
// Manual risk re-calculation triggered by an officer.

const calculateRisk = async (req, res) => {
  const { elderlyId } = req.body;
  if (!elderlyId || !/^\d+$/.test(String(elderlyId))) {
    return failure(res, 'VALIDATION_ERROR', 'elderlyId is required', 400);
  }

  try {
    const elderly = await prisma.elderly.findFirst({
      where:  { id: BigInt(elderlyId), organizationId: BigInt(req.user.organizationId) },
      select: { id: true, organizationId: true },
    });
    if (!elderly) return failure(res, 'NOT_FOUND', 'Elderly not found', 404);

    const riskEngine = require('../services/riskEngine.service');
    const result     = await riskEngine.calculateForElderly(elderlyId, elderly.organizationId.toString());

    return success(res, result);
  } catch (err) {
    console.error('[VoiceController.calculateRisk]', err);
    return failure(res, 'INTERNAL_ERROR', 'Risk calculation failed', 500);
  }
};

module.exports = {
  receiveTranscript,
  callComplete,
  scheduleCall,
  listCalls,
  getTranscripts,
  getRiskScores,
  calculateRisk,
};
