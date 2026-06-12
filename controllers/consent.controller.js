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
    organizationId: c.organizationId.toString(),
    consentType: c.consentType, action: c.action,
    consentVersion: c.consentVersion, collectedVia: c.collectedVia,
    ipAddress: c.ipAddress, evidenceUrl: c.evidenceUrl, createdAt: c.createdAt,
  };
}

// ── GET /api/v1/consent ───────────────────────────────────────────────────────

const list = async (req, res) => {
  const { elderlyId, consentType, page = '1', limit = '20' } = req.query;
  const orgId   = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum= Math.min(100, parseInt(limit, 10) || 20);

  const where = {
    organizationId: orgId,
    ...(elderlyId   ? { elderlyId: BigInt(elderlyId) } : {}),
    ...(consentType ? { consentType }                  : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.consentRecord.findMany({ where, skip: (pageNum - 1) * limitNum, take: limitNum, orderBy: { createdAt: 'desc' } }),
      prisma.consentRecord.count({ where }),
    ]);
    return paginated(res, items.map(serialize), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[ConsentController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch consent records', 500);
  }
};

// ── POST /api/v1/consent ──────────────────────────────────────────────────────

const record = async (req, res) => {
  const { elderlyId, consentType, action, consentVersion, consentText, collectedVia, evidenceUrl } = req.body;
  if (!elderlyId || !consentType || !action) {
    return failure(res, 'VALIDATION_ERROR', 'elderlyId, consentType, action required', 400);
  }
  const orgId = BigInt(req.user.organizationId);
  try {
    const item = await prisma.consentRecord.create({
      data: {
        organizationId: orgId,
        elderlyId:      BigInt(elderlyId),
        consentType, action, consentVersion, consentText, collectedVia,
        ipAddress:      req.ip,
        witnessUserId:  BigInt(req.user.id),
        evidenceUrl,
      },
    });
    await createAuditLog({
      userId: BigInt(req.user.id),
      action: `CONSENT_${action}`,
      tableName: 'consent_records',
      recordId: item.id,
      newData: { consentType, action, consentVersion },
      req,
    });
    return success(res, serialize(item), 201);
  } catch (err) {
    console.error('[ConsentController.record]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to record consent', 500);
  }
};

// ── GET /api/v1/consent/summary/:elderlyId ────────────────────────────────────

const getSummary = async (req, res) => {
  const eid = parseId(req.params.elderlyId);
  if (!eid) return failure(res, 'VALIDATION_ERROR', 'Invalid elderlyId', 400);
  const orgId = BigInt(req.user.organizationId);

  try {
    const records = await prisma.consentRecord.findMany({
      where: { elderlyId: eid, organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });

    // Build summary: latest status per consent type
    const summary = {};
    for (const r of records) {
      if (!summary[r.consentType]) {
        summary[r.consentType] = { latestAction: r.action, latestAt: r.createdAt, version: r.consentVersion };
      }
    }

    return success(res, {
      elderlyId: eid.toString(),
      summary,
      hasActivePdpa:     summary.PDPA?.latestAction === 'GIVEN',
      hasActiveHipaa:    summary.HIPAA?.latestAction === 'GIVEN',
      hasMarketing:      summary.MARKETING?.latestAction === 'GIVEN',
      history:           records.map(serialize),
    });
  } catch (err) {
    console.error('[ConsentController.getSummary]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch consent summary', 500);
  }
};

module.exports = { list, record, getSummary };
