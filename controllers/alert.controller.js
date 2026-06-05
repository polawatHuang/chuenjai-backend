const prisma = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');

/**
 * GET /api/v1/alerts
 * Lists alerts scoped to the caller's organization.
 * Query params: status, severity, page, limit
 */
const list = async (req, res) => {
  const { status, severity, page = '1', limit = '50' } = req.query;
  const orgId    = BigInt(req.user.organizationId);
  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip     = (pageNum - 1) * limitNum;

  const where = {
    elderly: { organizationId: orgId },
    ...(status   ? { status }   : {}),
    ...(severity ? { severity } : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.alert.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, elderlyId: true, alertType: true, severity: true,
          title: true, description: true, status: true,
          assignedUserId: true, createdAt: true, resolvedAt: true,
          elderly:      { select: { firstName: true, lastName: true } },
          assignedUser: { select: { fullName: true, phone: true } },
        },
      }),
      prisma.alert.count({ where }),
    ]);

    return paginated(res, items, { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[AlertController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch alerts', 500);
  }
};

/**
 * PATCH /api/v1/alerts/:id
 * Update status or assignedUserId on a single alert.
 */
const update = async (req, res) => {
  const id = req.params.id;
  if (!id || !/^\d+$/.test(id)) {
    return failure(res, 'VALIDATION_ERROR', 'Invalid alert ID', 400);
  }

  const { status, assignedUserId } = req.body;
  const VALID_STATUS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  if (status && !VALID_STATUS.includes(status)) {
    return failure(res, 'VALIDATION_ERROR', `status must be one of: ${VALID_STATUS.join(', ')}`, 400);
  }

  try {
    const existing = await prisma.alert.findFirst({
      where: {
        id:     BigInt(id),
        elderly: { organizationId: BigInt(req.user.organizationId) },
      },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Alert not found', 404);

    const updated = await prisma.alert.update({
      where: { id: BigInt(id) },
      data: {
        ...(status         ? { status, resolvedAt: status === 'RESOLVED' ? new Date() : null } : {}),
        ...(assignedUserId ? { assignedUserId: BigInt(assignedUserId) } : {}),
      },
    });

    return success(res, updated);
  } catch (err) {
    console.error('[AlertController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update alert', 500);
  }
};

module.exports = { list, update };
