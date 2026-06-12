const prisma = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');
const { createAuditLog } = require('../utils/audit');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

function serializeSub(s) {
  const daysSinceStart = Math.floor((Date.now() - new Date(s.startDate).getTime()) / 86400000);
  const daysRemaining  = s.renewalDueAt
    ? Math.max(0, Math.ceil((new Date(s.renewalDueAt).getTime() - Date.now()) / 86400000))
    : null;
  return {
    id:             s.id.toString(),
    elderlyId:      s.elderlyId.toString(),
    elderlyName:    s.elderly ? `${s.elderly.firstName ?? ''} ${s.elderly.lastName ?? ''}`.trim() : null,
    elderlyPhone:   s.elderly?.phone ?? null,
    formulationId:  s.formulationId?.toString() ?? null,
    planName:       s.planName,
    status:         s.status,
    stage:          s.stage,
    startDate:      s.startDate,
    endDate:        s.endDate,
    cycleDays:      s.cycleDays,
    priceThb:       parseFloat(s.priceThb),
    deliveryStatus: s.deliveryStatus,
    recallSentAt:   s.recallSentAt,
    renewalDueAt:   s.renewalDueAt,
    daysSinceStart,
    daysRemaining,
    createdAt:      s.createdAt,
    updatedAt:      s.updatedAt,
  };
}

// ── GET /api/v1/journey/board ─────────────────────────────────────────────────

const getBoard = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  const stages = ['ONBOARDING', 'ACTIVE', 'RECALL_DUE', 'RENEWAL_PENDING', 'CHURNED'];

  try {
    const subscriptions = await prisma.patientSubscription.findMany({
      where: { organizationId: orgId },
      include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    const board = {};
    for (const stage of stages) {
      board[stage] = subscriptions.filter((s) => s.stage === stage).map(serializeSub);
    }

    // Summary counts
    const summary = {
      totalActive:       subscriptions.filter((s) => s.status === 'ACTIVE').length,
      recallDueToday:    subscriptions.filter((s) => s.stage === 'RECALL_DUE').length,
      renewalPending:    subscriptions.filter((s) => s.stage === 'RENEWAL_PENDING').length,
      churned:           subscriptions.filter((s) => s.stage === 'CHURNED').length,
    };

    return success(res, { board, summary });
  } catch (err) {
    console.error('[JourneyController.getBoard]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch journey board', 500);
  }
};

// ── GET /api/v1/journey/subscriptions ────────────────────────────────────────

const listSubscriptions = async (req, res) => {
  const { elderlyId, status, stage, page = '1', limit = '20' } = req.query;
  const orgId   = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum= Math.min(100, parseInt(limit, 10) || 20);

  const where = {
    organizationId: orgId,
    ...(elderlyId ? { elderlyId: BigInt(elderlyId) } : {}),
    ...(status    ? { status }                        : {}),
    ...(stage     ? { stage }                         : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.patientSubscription.findMany({
        where, skip: (pageNum - 1) * limitNum, take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      }),
      prisma.patientSubscription.count({ where }),
    ]);
    return paginated(res, items.map(serializeSub), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[JourneyController.listSubscriptions]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch subscriptions', 500);
  }
};

// ── POST /api/v1/journey/subscriptions ───────────────────────────────────────

const createSubscription = async (req, res) => {
  const { elderlyId, formulationId, planName, priceThb, startDate, cycleDays = 90 } = req.body;
  if (!elderlyId || !planName || !priceThb || !startDate) {
    return failure(res, 'VALIDATION_ERROR', 'elderlyId, planName, priceThb, startDate required', 400);
  }

  const orgId = BigInt(req.user.organizationId);
  const start = new Date(startDate);
  const renewalDueAt = new Date(start);
  renewalDueAt.setDate(renewalDueAt.getDate() + parseInt(cycleDays, 10));

  try {
    const sub = await prisma.patientSubscription.create({
      data: {
        organizationId: orgId,
        elderlyId:      BigInt(elderlyId),
        formulationId:  formulationId ? BigInt(formulationId) : undefined,
        planName,
        priceThb,
        startDate:      start,
        cycleDays:      parseInt(cycleDays, 10),
        renewalDueAt,
        status:         'ACTIVE',
        stage:          'ONBOARDING',
      },
      include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    });
    await createAuditLog({ userId: BigInt(req.user.id), action: 'CREATE', tableName: 'patient_subscriptions', recordId: sub.id, req });
    return success(res, serializeSub(sub), 201);
  } catch (err) {
    console.error('[JourneyController.createSubscription]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create subscription', 500);
  }
};

// ── PATCH /api/v1/journey/subscriptions/:id ───────────────────────────────────

const updateSubscription = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  const { stage, status, deliveryStatus, formulationId } = req.body;
  try {
    const existing = await prisma.patientSubscription.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Subscription not found', 404);

    const sub = await prisma.patientSubscription.update({
      where: { id },
      data: {
        ...(stage          ? { stage }          : {}),
        ...(status         ? { status }         : {}),
        ...(deliveryStatus ? { deliveryStatus } : {}),
        ...(formulationId  ? { formulationId: BigInt(formulationId) } : {}),
      },
      include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    });
    await createAuditLog({ userId: BigInt(req.user.id), action: 'UPDATE', tableName: 'patient_subscriptions', recordId: id, req });
    return success(res, serializeSub(sub));
  } catch (err) {
    console.error('[JourneyController.updateSubscription]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update subscription', 500);
  }
};

// ── POST /api/v1/journey/subscriptions/:id/send-recall ───────────────────────

const sendRecall = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const sub = await prisma.patientSubscription.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
      include: { elderly: { select: { lineUserId: true, firstName: true, phone: true } } },
    });
    if (!sub) return failure(res, 'NOT_FOUND', 'Subscription not found', 404);

    if (sub.elderly?.lineUserId) {
      // Queue LINE recall notification
      await prisma.notification.create({
        data: {
          elderlyId: sub.elderlyId,
          channel:   'LINE',
          recipient: sub.elderly.lineUserId,
          subject:   'แจ้งเตือนการตรวจเลือดครั้งต่อไป',
          message:   `สวัสดีค่ะ คุณ${sub.elderly.firstName ?? ''} ถึงเวลาตรวจเลือดรอบใหม่แล้ว กรุณานัดหมายกับคลินิกของเราเพื่อปรับสูตรอาหารเสริมให้เหมาะกับร่างกายของคุณค่ะ 💊`,
        },
      });
    }

    // Update subscription
    const updated = await prisma.patientSubscription.update({
      where: { id },
      data: { recallSentAt: new Date(), stage: 'RECALL_DUE' },
      include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    });

    await createAuditLog({ userId: BigInt(req.user.id), action: 'UPDATE', tableName: 'patient_subscriptions', recordId: id, newData: { action: 'SEND_RECALL' }, req });
    return success(res, serializeSub(updated));
  } catch (err) {
    console.error('[JourneyController.sendRecall]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to send recall', 500);
  }
};

module.exports = { getBoard, listSubscriptions, createSubscription, updateSubscription, sendRecall };
