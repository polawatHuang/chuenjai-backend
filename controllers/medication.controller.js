const { z }  = require('zod');
const prisma = require('../config/prisma');
const { success, failure } = require('../utils/response');
const { createAuditLog }   = require('../utils/audit');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

async function verifyElderlyOwnership(elderlyId, orgId) {
  return prisma.elderly.findFirst({
    where: { id: BigInt(elderlyId), organizationId: BigInt(orgId) },
    select: { id: true },
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

const createSchema = z.object({
  elderlyId:           z.string().regex(/^\d+$/, 'elderlyId must be a numeric string'),
  medicationName:      z.string().max(255).optional(),
  dosage:              z.string().max(100).optional(),
  frequency:           z.string().max(100).optional(),
  // scheduleTime as "HH:MM" or "HH:MM:SS" — stored as DateTime @db.Time in Prisma/MySQL
  scheduleTime:        z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/, 'scheduleTime must be HH:MM or HH:MM:SS').optional(),
  startDate:           z.string().optional(),
  endDate:             z.string().optional(),
  prescribingHospital: z.string().max(255).optional(),
  isActive:            z.boolean().optional(),
});

/**
 * Converts "HH:MM" or "HH:MM:SS" to a DateTime Prisma accepts for @db.Time.
 * MySQL stores only the time portion; we anchor to an epoch date so the value
 * round-trips correctly through Prisma.
 */
function toScheduleDateTime(timeStr) {
  if (!timeStr) return undefined;
  const d = new Date(`1970-01-01T${timeStr.length === 5 ? timeStr + ':00' : timeStr}.000Z`);
  return isNaN(d.getTime()) ? undefined : d;
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/medications?elderlyId=<id>[&activeOnly=true]
 */
const list = async (req, res) => {
  const { elderlyId, activeOnly } = req.query;
  if (!elderlyId) {
    return failure(res, 'VALIDATION_ERROR', 'elderlyId query parameter is required', 400);
  }

  const eid = parseId(elderlyId);
  if (!eid) return failure(res, 'VALIDATION_ERROR', 'Invalid elderlyId', 400);

  try {
    const belongs = await verifyElderlyOwnership(eid, req.user.organizationId);
    if (!belongs) return failure(res, 'NOT_FOUND', 'Elderly not found', 404);

    const medications = await prisma.medication.findMany({
      where: {
        elderlyId: eid,
        ...(activeOnly === 'true' ? { isActive: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return success(res, medications);
  } catch (err) {
    console.error('[MedicationController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch medications', 500);
  }
};

/**
 * POST /api/v1/medications
 */
const create = async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);
  }

  const { elderlyId, ...data } = parsed.data;

  try {
    const belongs = await verifyElderlyOwnership(elderlyId, req.user.organizationId);
    if (!belongs) return failure(res, 'NOT_FOUND', 'Elderly not found', 404);

    const medication = await prisma.medication.create({
      data: {
        ...data,
        elderlyId:    BigInt(elderlyId),
        scheduleTime: toScheduleDateTime(data.scheduleTime),
        startDate:    data.startDate ? new Date(data.startDate) : undefined,
        endDate:      data.endDate   ? new Date(data.endDate)   : undefined,
      },
    });

    await createAuditLog({
      userId: BigInt(req.user.id), action: 'CREATE', tableName: 'medications',
      recordId: medication.id, newData: parsed.data, req,
    });

    return success(res, medication, 201);
  } catch (err) {
    console.error('[MedicationController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create medication', 500);
  }
};

/**
 * PUT /api/v1/medications/:id
 */
const update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  const updateSchema = createSchema.omit({ elderlyId: true }).partial();
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);
  }

  try {
    const existing = await prisma.medication.findFirst({
      where:   { id },
      include: { elderly: { select: { organizationId: true } } },
    });

    if (!existing || existing.elderly.organizationId.toString() !== req.user.organizationId) {
      return failure(res, 'NOT_FOUND', 'Medication not found', 404);
    }

    const updated = await prisma.medication.update({
      where: { id },
      data: {
        ...parsed.data,
        scheduleTime: parsed.data.scheduleTime !== undefined
          ? toScheduleDateTime(parsed.data.scheduleTime)
          : undefined,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
        endDate:   parsed.data.endDate   ? new Date(parsed.data.endDate)   : undefined,
      },
    });

    await createAuditLog({
      userId: BigInt(req.user.id), action: 'UPDATE', tableName: 'medications',
      recordId: id, oldData: existing, newData: parsed.data, req,
    });

    return success(res, updated);
  } catch (err) {
    console.error('[MedicationController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update medication', 500);
  }
};

/**
 * DELETE /api/v1/medications/:id
 * Soft-delete: sets isActive = false instead of removing the row so
 * medication_logs remain referentially intact.
 */
const remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const existing = await prisma.medication.findFirst({
      where:   { id },
      include: { elderly: { select: { organizationId: true } } },
    });

    if (!existing || existing.elderly.organizationId.toString() !== req.user.organizationId) {
      return failure(res, 'NOT_FOUND', 'Medication not found', 404);
    }

    await prisma.medication.update({ where: { id }, data: { isActive: false } });

    await createAuditLog({
      userId: BigInt(req.user.id), action: 'DELETE', tableName: 'medications',
      recordId: id, oldData: existing, req,
    });

    return success(res, { message: 'Medication deactivated successfully' });
  } catch (err) {
    console.error('[MedicationController.remove]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to deactivate medication', 500);
  }
};

module.exports = { list, create, update, remove };
