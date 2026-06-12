const prisma = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');

function serialize(l) {
  return {
    id: l.id.toString(), elderlyId: l.elderlyId.toString(),
    logDate: l.logDate, source: l.source,
    foodData: l.foodData, sleepData: l.sleepData,
    moodScore: l.moodScore, stepsCount: l.stepsCount,
    heartRate: l.heartRate, hrv: l.hrv ? parseFloat(l.hrv) : null,
    createdAt: l.createdAt,
  };
}

const list = async (req, res) => {
  const { elderlyId, from, to, page = '1', limit = '30' } = req.query;
  const orgId   = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum= Math.min(100, parseInt(limit, 10) || 30);
  const skip    = (pageNum - 1) * limitNum;

  const where = {
    elderly: { organizationId: orgId },
    ...(elderlyId ? { elderlyId: BigInt(elderlyId) } : {}),
    ...((from || to) ? { logDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.lifestyleLog.findMany({ where, skip, take: limitNum, orderBy: { logDate: 'desc' } }),
      prisma.lifestyleLog.count({ where }),
    ]);
    return paginated(res, items.map(serialize), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[LifestyleLogController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch lifestyle logs', 500);
  }
};

const create = async (req, res) => {
  const { elderlyId, logDate, source = 'LINE', foodData, sleepData, moodScore, stepsCount, heartRate, hrv, rawPayload } = req.body;
  if (!elderlyId || !logDate) return failure(res, 'VALIDATION_ERROR', 'elderlyId and logDate required', 400);

  try {
    const item = await prisma.lifestyleLog.create({
      data: { elderlyId: BigInt(elderlyId), logDate: new Date(logDate), source, foodData, sleepData, moodScore, stepsCount, heartRate, hrv, rawPayload },
    });
    return success(res, serialize(item), 201);
  } catch (err) {
    console.error('[LifestyleLogController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create lifestyle log', 500);
  }
};

module.exports = { list, create };
