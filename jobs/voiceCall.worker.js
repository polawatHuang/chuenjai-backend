/**
 * Voice Call Worker  (voice-call-queue)
 *
 * Dequeues outbound call requests and delegates to the Voice AI service.
 *
 * Job payload schema:
 * {
 *   elderlyId:      string   — BigInt ID of the target elderly
 *   phoneNumber:    string   — Destination phone (E.164 preferred)
 *   callType:       string   — MEDICATION | HEALTH_CHECK | APPOINTMENT | EMERGENCY
 *   organizationId: string   — Caller's tenant ID
 *   notificationId: string?  — DB notification row that triggered this call (if any)
 * }
 */
const { Worker } = require('bullmq');
const { connection } = require('../queues/queue.config');
const { QUEUE_NAMES } = require('../queues/queues');
const prisma = require('../config/prisma');

// ── Voice service hook ────────────────────────────────────────────────────────

async function initiateOutboundCall({ callId, elderlyId, phoneNumber, callType, organizationId }) {
  try {
    const voiceAi = require('../services/voiceAi.service');
    const elderly = await prisma.elderly.findUnique({
      where:  { id: BigInt(elderlyId) },
      select: { firstName: true },
    });
    const greeting = await voiceAi.buildInitialGreeting(elderly?.firstName ?? null);
    console.log(
      `[VoiceCall] → Dispatch call ${callId} to ${phoneNumber} (${callType}, org: ${organizationId})\n` +
      `             Opening: "${greeting}"`
    );
  } catch (err) {
    console.warn(`[VoiceCall] Could not generate greeting for call ${callId}:`, err.message);
    console.log(`[VoiceCall] → Dispatch call ${callId} to ${phoneNumber} (${callType}, org: ${organizationId})`);
  }

  // Status arrives via /api/v1/voice/call-complete webhook after the call ends.
  return {
    callStatus:      null,
    durationSeconds: null,
    recordingUrl:    null,
  };
}

// ── Worker ────────────────────────────────────────────────────────────────────

const voiceCallWorker = new Worker(
  QUEUE_NAMES.VOICE_CALL,
  async (job) => {
    const { elderlyId, phoneNumber, callType, organizationId, notificationId } = job.data;

    if (!elderlyId || !phoneNumber) {
      throw new Error('voiceCall job is missing required fields: elderlyId, phoneNumber');
    }

    job.log(`Starting outbound call to elderly ${elderlyId} at ${phoneNumber} (${callType})`);

    // ── 1. Persist the Call record before touching the carrier ────────────────
    const call = await prisma.call.create({
      data: {
        elderlyId:  BigInt(elderlyId),
        phoneNumber,
        callType:   callType || null,
        callStatus: null,
        startedAt:  new Date(),
      },
    });

    job.log(`Call record created: id=${call.id}`);

    // ── 2. Delegate to voice service ──────────────────────────────────────────
    let result;
    try {
      result = await initiateOutboundCall({
        callId:         call.id.toString(),
        elderlyId,
        phoneNumber,
        callType,
        organizationId,
      });
    } catch (callErr) {
      await prisma.call.update({
        where: { id: call.id },
        data:  { callStatus: 'FAILED', endedAt: new Date() },
      }).catch(() => {});

      if (notificationId) {
        await prisma.notification.update({
          where: { id: BigInt(notificationId) },
          data:  { deliveryStatus: 'FAILED' },
        }).catch(() => {});
      }

      throw callErr;
    }

    // ── 3. Update Call row with result (if immediately available) ─────────────
    if (result.callStatus) {
      await prisma.call.update({
        where: { id: call.id },
        data: {
          callStatus:      result.callStatus,
          durationSeconds: result.durationSeconds ?? null,
          recordingUrl:    result.recordingUrl    ?? null,
          endedAt:         new Date(),
        },
      }).catch((err) => {
        console.warn(`[VoiceCallWorker] Could not update call ${call.id}:`, err.message);
      });
    }

    return {
      callId:    call.id.toString(),
      elderlyId,
      callType,
      status:    result.callStatus ?? 'dispatched',
    };
  },
  {
    connection,
    concurrency: parseInt(process.env.VOICE_CALL_CONCURRENCY || '3', 10),
  }
);

// ── Event handlers ────────────────────────────────────────────────────────────

voiceCallWorker.on('completed', (job, result) => {
  console.log(`[VoiceCallWorker] Job ${job.id} completed — callId: ${result.callId}, status: ${result.status}`);
});

voiceCallWorker.on('failed', (job, err) => {
  console.error(
    `[VoiceCallWorker] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}):`,
    err.message
  );
});

voiceCallWorker.on('error', (err) => {
  console.error('[VoiceCallWorker] Worker error:', err.message);
});

module.exports = voiceCallWorker;
