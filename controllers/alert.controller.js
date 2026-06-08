const prisma = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');

const ALERT_SELECT = {
  id: true, elderlyId: true, alertType: true, severity: true,
  title: true, description: true, status: true,
  assignedUserId: true, resolvedBy: true, resolvedAt: true,
  resolutionNotes: true, escalationLevel: true, createdAt: true,
  elderly:      { select: { firstName: true, lastName: true, phone: true } },
  assignedUser: { select: { id: true, fullName: true, role: true } },
};

function serialize(a) {
  return {
    ...a,
    id:             a.id.toString(),
    elderlyId:      a.elderlyId.toString(),
    assignedUserId: a.assignedUserId ? a.assignedUserId.toString() : null,
    resolvedBy:     a.resolvedBy     ? a.resolvedBy.toString()     : null,
    assignedUser:   a.assignedUser   ? { ...a.assignedUser, id: a.assignedUser.id?.toString() } : null,
  };
}

// ── GET /api/v1/alerts ────────────────────────────────────────────────────────

const list = async (req, res) => {
  const { status, severity, elderlyId, page = '1', limit = '50' } = req.query;
  const orgId    = BigInt(req.user.organizationId);
  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip     = (pageNum - 1) * limitNum;

  const elderlyIdBig = elderlyId && /^\d+$/.test(elderlyId) ? BigInt(elderlyId) : null;

  const where = {
    elderly: { organizationId: orgId },
    ...(status       ? { status }                  : {}),
    ...(severity     ? { severity }                : {}),
    ...(elderlyIdBig ? { elderlyId: elderlyIdBig } : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.alert.findMany({
        where, skip, take: limitNum,
        orderBy: [{ escalationLevel: 'desc' }, { createdAt: 'desc' }],
        select: ALERT_SELECT,
      }),
      prisma.alert.count({ where }),
    ]);
    return paginated(res, items.map(serialize), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[AlertController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch alerts', 500);
  }
};

// ── GET /api/v1/alerts/counts ─────────────────────────────────────────────────

const counts = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  try {
    const [bySev, byStatus] = await Promise.all([
      prisma.alert.groupBy({
        by: ['severity'],
        where: { elderly: { organizationId: orgId }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        _count: { id: true },
      }),
      prisma.alert.groupBy({
        by: ['status'],
        where: { elderly: { organizationId: orgId } },
        _count: { id: true },
      }),
    ]);

    const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const r of bySev) if (r.severity) severityCounts[r.severity] = r._count.id;

    const statusCounts = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 };
    for (const r of byStatus) statusCounts[r.status] = r._count.id;

    return success(res, { severity: severityCounts, status: statusCounts });
  } catch (err) {
    console.error('[AlertController.counts]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch counts', 500);
  }
};

// ── GET /api/v1/alerts/officers ───────────────────────────────────────────────

const officers = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  try {
    const users = await prisma.user.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        role: { in: ['OFFICER', 'NURSE', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'] },
      },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    });
    return success(res, users.map(u => ({ id: u.id.toString(), fullName: u.fullName, role: u.role })));
  } catch (err) {
    console.error('[AlertController.officers]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch officers', 500);
  }
};

// ── PATCH /api/v1/alerts/:id ──────────────────────────────────────────────────

const update = async (req, res) => {
  const id = req.params.id;
  if (!id || !/^\d+$/.test(id)) return failure(res, 'VALIDATION_ERROR', 'Invalid alert ID', 400);

  const { status, assignedUserId, resolutionNotes, escalationLevel } = req.body;
  const VALID_STATUS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  if (status && !VALID_STATUS.includes(status)) {
    return failure(res, 'VALIDATION_ERROR', `status must be one of: ${VALID_STATUS.join(', ')}`, 400);
  }

  try {
    const existing = await prisma.alert.findFirst({
      where: { id: BigInt(id), elderly: { organizationId: BigInt(req.user.organizationId) } },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Alert not found', 404);

    const data = {
      ...(status !== undefined ? {
        status,
        resolvedAt: status === 'RESOLVED' ? new Date() : (status === 'OPEN' ? null : existing.resolvedAt),
        resolvedBy: status === 'RESOLVED' ? BigInt(req.user.id) : (status === 'OPEN' ? null : existing.resolvedBy),
      } : {}),
      ...(assignedUserId !== undefined ? {
        assignedUserId: assignedUserId ? BigInt(assignedUserId) : null,
      } : {}),
      ...(resolutionNotes !== undefined ? { resolutionNotes } : {}),
      ...(escalationLevel !== undefined ? { escalationLevel: parseInt(escalationLevel, 10) } : {}),
    };

    const updated = await prisma.alert.update({
      where:  { id: BigInt(id) },
      data,
      select: ALERT_SELECT,
    });
    return success(res, serialize(updated));
  } catch (err) {
    console.error('[AlertController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update alert', 500);
  }
};

module.exports = { list, counts, officers, update };
