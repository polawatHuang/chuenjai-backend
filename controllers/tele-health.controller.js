const prisma = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');
const { createAuditLog } = require('../utils/audit');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

function serialize(c) {
  return {
    id: c.id.toString(), elderlyId: c.elderlyId.toString(),
    doctorUserId: c.doctorUserId.toString(),
    elderlyName: c.elderly ? `${c.elderly.firstName ?? ''} ${c.elderly.lastName ?? ''}`.trim() : null,
    doctorName: c.doctor?.fullName ?? null,
    roomName: c.roomName, scheduledAt: c.scheduledAt,
    startedAt: c.startedAt, endedAt: c.endedAt,
    durationSeconds: c.durationSeconds, recordingUrl: c.recordingUrl,
    consultationNotes: c.consultationNotes,
    formulationAdjusted: c.formulationAdjusted,
    newFormulationId: c.newFormulationId?.toString() ?? null,
    status: c.status, createdAt: c.createdAt,
  };
}

const include = {
  elderly: { select: { id: true, firstName: true, lastName: true, phone: true } },
  doctor:  { select: { id: true, fullName: true } },
};

// ── GET /api/v1/tele-health/doctor-slots ─────────────────────────────────────

const getDoctorSlots = async (req, res) => {
  const { doctorId, from, to } = req.query;
  const orgId = BigInt(req.user.organizationId);

  const start = from ? new Date(from) : new Date();
  const end   = to   ? new Date(to)   : new Date(Date.now() + 30 * 86400000);

  try {
    const consultations = await prisma.videoConsultation.findMany({
      where: {
        organizationId: orgId,
        scheduledAt: { gte: start, lte: end },
        ...(doctorId ? { doctorUserId: BigInt(doctorId) } : {}),
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
      },
      include,
      orderBy: { scheduledAt: 'asc' },
    });
    return success(res, consultations.map(serialize));
  } catch (err) {
    console.error('[TeleHealthController.getDoctorSlots]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch slots', 500);
  }
};

// ── GET /api/v1/tele-health/consultations ────────────────────────────────────

const list = async (req, res) => {
  const { elderlyId, doctorId, status, page = '1', limit = '20' } = req.query;
  const orgId   = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum= Math.min(100, parseInt(limit, 10) || 20);

  const where = {
    organizationId: orgId,
    ...(elderlyId ? { elderlyId: BigInt(elderlyId) }    : {}),
    ...(doctorId  ? { doctorUserId: BigInt(doctorId) }  : {}),
    ...(status    ? { status }                          : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.videoConsultation.findMany({ where, skip: (pageNum - 1) * limitNum, take: limitNum, orderBy: { scheduledAt: 'desc' }, include }),
      prisma.videoConsultation.count({ where }),
    ]);
    return paginated(res, items.map(serialize), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[TeleHealthController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch consultations', 500);
  }
};

// ── GET /api/v1/tele-health/consultations/:id ────────────────────────────────

const getById = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    const item = await prisma.videoConsultation.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) }, include,
    });
    if (!item) return failure(res, 'NOT_FOUND', 'Consultation not found', 404);
    return success(res, serialize(item));
  } catch (err) {
    console.error('[TeleHealthController.getById]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch consultation', 500);
  }
};

// ── POST /api/v1/tele-health/consultations ───────────────────────────────────

const create = async (req, res) => {
  const { elderlyId, doctorUserId, scheduledAt } = req.body;
  if (!elderlyId || !scheduledAt) return failure(res, 'VALIDATION_ERROR', 'elderlyId and scheduledAt required', 400);

  const orgId = BigInt(req.user.organizationId);
  const roomName = `consult-${orgId}-${elderlyId}-${Date.now()}`;

  try {
    const item = await prisma.videoConsultation.create({
      data: {
        organizationId: orgId,
        elderlyId:      BigInt(elderlyId),
        doctorUserId:   BigInt(doctorUserId ?? req.user.id),
        roomName,
        scheduledAt:    new Date(scheduledAt),
      },
      include,
    });
    await createAuditLog({ userId: BigInt(req.user.id), action: 'CREATE', tableName: 'video_consultations', recordId: item.id, req });
    return success(res, serialize(item), 201);
  } catch (err) {
    console.error('[TeleHealthController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create consultation', 500);
  }
};

// ── PATCH /api/v1/tele-health/consultations/:id ──────────────────────────────

const update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    const existing = await prisma.videoConsultation.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Consultation not found', 404);

    const { consultationNotes, status, formulationAdjusted, newFormulationId, scheduledAt } = req.body;
    const item = await prisma.videoConsultation.update({
      where: { id },
      data: {
        ...(consultationNotes  !== undefined ? { consultationNotes }  : {}),
        ...(status             !== undefined ? { status }             : {}),
        ...(formulationAdjusted !== undefined ? { formulationAdjusted } : {}),
        ...(newFormulationId   !== undefined ? { newFormulationId: newFormulationId ? BigInt(newFormulationId) : null } : {}),
        ...(scheduledAt        !== undefined ? { scheduledAt: new Date(scheduledAt) } : {}),
      },
      include,
    });
    await createAuditLog({ userId: BigInt(req.user.id), action: 'UPDATE', tableName: 'video_consultations', recordId: id, req });
    return success(res, serialize(item));
  } catch (err) {
    console.error('[TeleHealthController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update consultation', 500);
  }
};

// ── POST /api/v1/tele-health/consultations/:id/start ────────────────────────

const startSession = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const existing = await prisma.videoConsultation.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Consultation not found', 404);

    // Generate LiveKit token if available
    let livekitToken = null;
    try {
      const { AccessToken } = require('livekit-server-sdk');
      const apiKey    = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;
      if (apiKey && apiSecret) {
        const token = new AccessToken(apiKey, apiSecret, {
          identity: `user-${req.user.id}`,
          name:     req.user.fullName ?? req.user.username,
        });
        token.addGrant({ roomJoin: true, room: existing.roomName, canPublish: true, canSubscribe: true });
        livekitToken = await token.toJwt();
      }
    } catch (e) {
      console.warn('[TeleHealthController.startSession] LiveKit SDK not available:', e.message);
    }

    const item = await prisma.videoConsultation.update({
      where: { id },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
      include,
    });

    return success(res, { ...serialize(item), livekitToken, livekitUrl: process.env.LIVEKIT_URL ?? null });
  } catch (err) {
    console.error('[TeleHealthController.startSession]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to start session', 500);
  }
};

// ── POST /api/v1/tele-health/consultations/:id/end ──────────────────────────

const endSession = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const existing = await prisma.videoConsultation.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Consultation not found', 404);

    const now = new Date();
    const durationSeconds = existing.startedAt
      ? Math.floor((now.getTime() - new Date(existing.startedAt).getTime()) / 1000)
      : null;

    const item = await prisma.videoConsultation.update({
      where: { id },
      data: { status: 'COMPLETED', endedAt: now, durationSeconds },
      include,
    });
    return success(res, serialize(item));
  } catch (err) {
    console.error('[TeleHealthController.endSession]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to end session', 500);
  }
};

module.exports = { getDoctorSlots, list, getById, create, update, startSession, endSession };
