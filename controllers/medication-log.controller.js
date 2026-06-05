const { z }  = require('zod');
const prisma = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');
const { createAuditLog } = require('../utils/audit');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

// ── Validation ────────────────────────────────────────────────────────────────

const createSchema = z.object({
  medicationId:  z.string().regex(/^\d+$/, 'medicationId must be a numeric string'),
  elderlyId:     z.string().regex(/^\d+$/, 'elderlyId must be a numeric string'),
  status:        z.enum(['TAKEN', 'MISSED', 'SKIPPED']),
  source:        z.enum(['LINE', 'VOICE_AI', 'OFFICER', 'MOBILE_APP']).optional(),
  scheduledTime: z.string().datetime({ offset: true }).optional(),
  takenTime:     z.string().datetime({ offset: true }).optional(),
  notes:         z.string().optional(),
});

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/medication-logs?elderlyId=<id>[&page=1&limit=20]
 * Returns the compliance history for a given elderly, newest first.
 */
const list = async (req, res) => {
  const { elderlyId, medicationId, page = '1', limit = '20' } = req.query;

  if (!elderlyId) {
    return failure(res, 'VALIDATION_ERROR', 'elderlyId query parameter is required', 400);
  }

  const eid = parseId(elderlyId);
  if (!eid) return failure(res, 'VALIDATION_ERROR', 'Invalid elderlyId', 400);

  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip     = (pageNum - 1) * limitNum;

  try {
    // AP-01: verify elderly belongs to caller's org
    const elderly = await prisma.elderly.findFirst({
      where: { id: eid, organizationId: BigInt(req.user.organizationId) },
      select: { id: true },
    });
    if (!elderly) return failure(res, 'NOT_FOUND', 'Elderly not found', 404);

    const where = {
      elderlyId: eid,
      ...(medicationId ? { medicationId: BigInt(medicationId) } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.medicationLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          medication: { select: { medicationName: true, dosage: true } },
        },
      }),
      prisma.medicationLog.count({ where }),
    ]);

    return paginated(res, items, { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[MedicationLogController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch medication logs', 500);
  }
};

/**
 * POST /api/v1/medication-logs
 *
 * Records one compliance event (TAKEN / MISSED / SKIPPED) for a medication.
 * The medication must belong to an elderly in the caller's organization.
 */
const create = async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);
  }

  const { medicationId, elderlyId, ...data } = parsed.data;
  const mid = BigInt(medicationId);
  const eid = BigInt(elderlyId);
  const orgId = BigInt(req.user.organizationId);

  try {
    // AP-01: confirm both medication and elderly are within the caller's org
    const medication = await prisma.medication.findFirst({
      where: { id: mid, elderlyId: eid },
      include: {
        elderly: { select: { organizationId: true } },
      },
    });

    if (!medication || medication.elderly.organizationId.toString() !== req.user.organizationId) {
      return failure(res, 'NOT_FOUND', 'Medication not found for this elderly', 404);
    }

    const log = await prisma.medicationLog.create({
      data: {
        ...data,
        medicationId:  mid,
        elderlyId:     eid,
        scheduledTime: data.scheduledTime ? new Date(data.scheduledTime) : undefined,
        takenTime:     data.takenTime     ? new Date(data.takenTime)     : undefined,
      },
    });

    await createAuditLog({
      userId: BigInt(req.user.id), action: 'CREATE', tableName: 'medication_logs',
      recordId: log.id, newData: parsed.data, req,
    });

    return success(res, log, 201);
  } catch (err) {
    console.error('[MedicationLogController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to record medication log', 500);
  }
};

module.exports = { list, create };
