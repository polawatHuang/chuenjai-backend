const { z }    = require('zod');
const prisma   = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');
const { createAuditLog } = require('../utils/audit');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

function serializeLab(r) {
  return {
    id:           r.id.toString(),
    elderlyId:    r.elderlyId.toString(),
    organizationId: r.organizationId.toString(),
    panelId:      r.panelId?.toString() ?? null,
    panelName:    r.panel?.panelName ?? null,
    collectedAt:  r.collectedAt,
    reportedAt:   r.reportedAt,
    labName:      r.labName,
    lisRefId:     r.lisRefId,
    status:       r.status,
    results:      r.results,
    dnaData:      r.dnaData,
    hormoneData:  r.hormoneData,
    notes:        r.notes,
    createdAt:    r.createdAt,
  };
}

// ── GET /api/v1/lab-results ───────────────────────────────────────────────────

const list = async (req, res) => {
  const { elderlyId, status, page = '1', limit = '20' } = req.query;
  const orgId   = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum= Math.min(100, parseInt(limit, 10) || 20);
  const skip    = (pageNum - 1) * limitNum;

  const where = {
    organizationId: orgId,
    ...(elderlyId ? { elderlyId: BigInt(elderlyId) } : {}),
    ...(status    ? { status }                        : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.labResult.findMany({
        where, skip, take: limitNum,
        orderBy: { collectedAt: 'desc' },
        include: { panel: { select: { panelName: true } } },
      }),
      prisma.labResult.count({ where }),
    ]);
    return paginated(res, items.map(serializeLab), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[LabResultController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch lab results', 500);
  }
};

// ── GET /api/v1/lab-results/:id ───────────────────────────────────────────────

const getById = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const item = await prisma.labResult.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
      include: { panel: { select: { panelName: true } } },
    });
    if (!item) return failure(res, 'NOT_FOUND', 'Lab result not found', 404);
    return success(res, serializeLab(item));
  } catch (err) {
    console.error('[LabResultController.getById]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch lab result', 500);
  }
};

const createSchema = z.object({
  elderlyId:   z.string().regex(/^\d+$/),
  panelId:     z.string().regex(/^\d+$/).optional(),
  collectedAt: z.string().datetime({ offset: true }),
  reportedAt:  z.string().datetime({ offset: true }).optional(),
  labName:     z.string().max(255).optional(),
  lisRefId:    z.string().max(255).optional(),
  status:      z.enum(['NORMAL', 'BORDERLINE', 'ABNORMAL', 'CRITICAL']).optional(),
  results:     z.array(z.object({
    name:      z.string(),
    value:     z.number(),
    unit:      z.string(),
    refMin:    z.number().optional(),
    refMax:    z.number().optional(),
    status:    z.enum(['NORMAL', 'BORDERLINE', 'ABNORMAL', 'CRITICAL']).optional(),
  })),
  dnaData:     z.record(z.unknown()).optional(),
  hormoneData: z.record(z.unknown()).optional(),
  notes:       z.string().optional(),
});

// ── POST /api/v1/lab-results ──────────────────────────────────────────────────

const create = async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);

  const { elderlyId, panelId, ...data } = parsed.data;
  const orgId = BigInt(req.user.organizationId);

  try {
    const elderly = await prisma.elderly.findFirst({
      where: { id: BigInt(elderlyId), organizationId: orgId },
      select: { id: true },
    });
    if (!elderly) return failure(res, 'NOT_FOUND', 'Patient not found', 404);

    const item = await prisma.labResult.create({
      data: {
        ...data,
        elderlyId:      BigInt(elderlyId),
        organizationId: orgId,
        panelId:        panelId ? BigInt(panelId) : undefined,
        collectedAt:    new Date(data.collectedAt),
        reportedAt:     data.reportedAt ? new Date(data.reportedAt) : undefined,
        uploadedBy:     BigInt(req.user.id),
      },
      include: { panel: { select: { panelName: true } } },
    });
    await createAuditLog({ userId: BigInt(req.user.id), action: 'CREATE', tableName: 'lab_results', recordId: item.id, newData: parsed.data, req });
    return success(res, serializeLab(item), 201);
  } catch (err) {
    console.error('[LabResultController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create lab result', 500);
  }
};

// ── PUT /api/v1/lab-results/:id ───────────────────────────────────────────────

const update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const existing = await prisma.labResult.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Lab result not found', 404);

    const { elderlyId, ...data } = req.body;
    const item = await prisma.labResult.update({
      where: { id },
      data: {
        ...data,
        ...(data.collectedAt ? { collectedAt: new Date(data.collectedAt) } : {}),
        ...(data.reportedAt  ? { reportedAt:  new Date(data.reportedAt)  } : {}),
      },
      include: { panel: { select: { panelName: true } } },
    });
    await createAuditLog({ userId: BigInt(req.user.id), action: 'UPDATE', tableName: 'lab_results', recordId: id, req });
    return success(res, serializeLab(item));
  } catch (err) {
    console.error('[LabResultController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update lab result', 500);
  }
};

// ── DELETE /api/v1/lab-results/:id ───────────────────────────────────────────

const remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const existing = await prisma.labResult.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Lab result not found', 404);

    await prisma.labResult.delete({ where: { id } });
    return success(res, { id: id.toString() });
  } catch (err) {
    console.error('[LabResultController.remove]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to delete lab result', 500);
  }
};

// ── Lab Panels ────────────────────────────────────────────────────────────────

const listPanels = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  try {
    const panels = await prisma.labPanel.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { panelName: 'asc' },
    });
    return success(res, panels.map((p) => ({ ...p, id: p.id.toString(), organizationId: p.organizationId.toString() })));
  } catch (err) {
    console.error('[LabResultController.listPanels]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch panels', 500);
  }
};

const createPanel = async (req, res) => {
  const { panelName, panelCode, description } = req.body;
  if (!panelName) return failure(res, 'VALIDATION_ERROR', 'panelName is required', 400);

  try {
    const panel = await prisma.labPanel.create({
      data: { organizationId: BigInt(req.user.organizationId), panelName, panelCode, description },
    });
    return success(res, { ...panel, id: panel.id.toString(), organizationId: panel.organizationId.toString() }, 201);
  } catch (err) {
    console.error('[LabResultController.createPanel]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create panel', 500);
  }
};

module.exports = { list, getById, create, update, remove, listPanels, createPanel };
