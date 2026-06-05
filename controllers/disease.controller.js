const { z }  = require('zod');
const prisma = require('../config/prisma');
const { success, failure } = require('../utils/response');
const { createAuditLog }   = require('../utils/audit');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

/**
 * AP-01 guard: confirm the elderly record belongs to the caller's organization.
 */
async function verifyElderlyOwnership(elderlyId, orgId) {
  return prisma.elderly.findFirst({
    where: { id: BigInt(elderlyId), organizationId: BigInt(orgId) },
    select: { id: true },
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

const createSchema = z.object({
  elderlyId:     z.string().regex(/^\d+$/, 'elderlyId must be a numeric string'),
  diseaseCode:   z.string().max(50).optional(),
  diseaseName:   z.string().max(255).optional(),
  diagnosedDate: z.string().optional(),
  severity:      z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  notes:         z.string().optional(),
});

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/diseases?elderlyId=<id>
 */
const list = async (req, res) => {
  const { elderlyId } = req.query;
  if (!elderlyId) {
    return failure(res, 'VALIDATION_ERROR', 'elderlyId query parameter is required', 400);
  }

  const eid = parseId(elderlyId);
  if (!eid) return failure(res, 'VALIDATION_ERROR', 'Invalid elderlyId', 400);

  try {
    const belongs = await verifyElderlyOwnership(eid, req.user.organizationId);
    if (!belongs) return failure(res, 'NOT_FOUND', 'Elderly not found', 404);

    const diseases = await prisma.disease.findMany({
      where:   { elderlyId: eid },
      orderBy: { createdAt: 'desc' },
    });

    return success(res, diseases);
  } catch (err) {
    console.error('[DiseaseController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch diseases', 500);
  }
};

/**
 * POST /api/v1/diseases
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

    const disease = await prisma.disease.create({
      data: {
        ...data,
        elderlyId:     BigInt(elderlyId),
        diagnosedDate: data.diagnosedDate ? new Date(data.diagnosedDate) : undefined,
      },
    });

    await createAuditLog({
      userId: BigInt(req.user.id), action: 'CREATE', tableName: 'diseases',
      recordId: disease.id, newData: parsed.data, req,
    });

    return success(res, disease, 201);
  } catch (err) {
    console.error('[DiseaseController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create disease', 500);
  }
};

/**
 * PUT /api/v1/diseases/:id
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
    // AP-01: fetch via elderly join to verify org ownership
    const existing = await prisma.disease.findFirst({
      where:   { id },
      include: { elderly: { select: { organizationId: true } } },
    });

    if (!existing || existing.elderly.organizationId.toString() !== req.user.organizationId) {
      return failure(res, 'NOT_FOUND', 'Disease not found', 404);
    }

    const updated = await prisma.disease.update({
      where: { id },
      data: {
        ...parsed.data,
        diagnosedDate: parsed.data.diagnosedDate ? new Date(parsed.data.diagnosedDate) : undefined,
      },
    });

    await createAuditLog({
      userId: BigInt(req.user.id), action: 'UPDATE', tableName: 'diseases',
      recordId: id, oldData: existing, newData: parsed.data, req,
    });

    return success(res, updated);
  } catch (err) {
    console.error('[DiseaseController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update disease', 500);
  }
};

/**
 * DELETE /api/v1/diseases/:id
 */
const remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const existing = await prisma.disease.findFirst({
      where:   { id },
      include: { elderly: { select: { organizationId: true } } },
    });

    if (!existing || existing.elderly.organizationId.toString() !== req.user.organizationId) {
      return failure(res, 'NOT_FOUND', 'Disease not found', 404);
    }

    await prisma.disease.delete({ where: { id } });

    await createAuditLog({
      userId: BigInt(req.user.id), action: 'DELETE', tableName: 'diseases',
      recordId: id, oldData: existing, req,
    });

    return success(res, { message: 'Disease deleted successfully' });
  } catch (err) {
    console.error('[DiseaseController.remove]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to delete disease', 500);
  }
};

module.exports = { list, create, update, remove };
