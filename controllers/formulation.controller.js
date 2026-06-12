const prisma   = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');
const { createAuditLog } = require('../utils/audit');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

function serializeItem(i) {
  return {
    id: i.id.toString(), formulationId: i.formulationId.toString(),
    ingredientId: i.ingredientId.toString(),
    ingredientName: i.ingredient?.name ?? null,
    ingredientUnit: i.ingredient?.unit ?? 'mg',
    doseMg: parseFloat(i.doseMg), frequency: i.frequency,
    notes: i.notes, sortOrder: i.sortOrder,
  };
}

function serialize(f) {
  return {
    id: f.id.toString(), elderlyId: f.elderlyId.toString(),
    organizationId: f.organizationId.toString(),
    labResultId: f.labResultId?.toString() ?? null,
    version: f.version, name: f.name,
    aiNotes: f.aiNotes, doctorNotes: f.doctorNotes,
    createdBy: f.createdBy?.toString() ?? null,
    approvedBy: f.approvedBy?.toString() ?? null,
    approvedAt: f.approvedAt, isActive: f.isActive,
    createdAt: f.createdAt, updatedAt: f.updatedAt,
    items: f.items ? f.items.map(serializeItem) : [],
  };
}

function serializeOemOrder(o) {
  return {
    id: o.id.toString(), elderlyId: o.elderlyId.toString(),
    formulationId: o.formulationId.toString(),
    subscriptionId: o.subscriptionId?.toString() ?? null,
    oemOrderRef: o.oemOrderRef, status: o.status,
    submittedAt: o.submittedAt,
    estimatedDelivery: o.estimatedDelivery,
    trackingNumber: o.trackingNumber,
    totalCostThb: o.totalCostThb ? parseFloat(o.totalCostThb) : null,
    notes: o.notes, createdAt: o.createdAt,
  };
}

// ── GET /api/v1/formulations ──────────────────────────────────────────────────

const list = async (req, res) => {
  const { elderlyId, isActive, page = '1', limit = '20' } = req.query;
  const orgId   = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum= Math.min(100, parseInt(limit, 10) || 20);

  const where = {
    organizationId: orgId,
    ...(elderlyId ? { elderlyId: BigInt(elderlyId) } : {}),
    ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.formulation.findMany({
        where, skip: (pageNum - 1) * limitNum, take: limitNum,
        orderBy: [{ createdAt: 'desc' }],
        include: { items: { include: { ingredient: { select: { name: true, unit: true } } } } },
      }),
      prisma.formulation.count({ where }),
    ]);
    return paginated(res, items.map(serialize), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[FormulationController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch formulations', 500);
  }
};

// ── GET /api/v1/formulations/:id ──────────────────────────────────────────────

const getById = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    const item = await prisma.formulation.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
      include: { items: { include: { ingredient: { select: { name: true, unit: true } } }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!item) return failure(res, 'NOT_FOUND', 'Formulation not found', 404);
    return success(res, serialize(item));
  } catch (err) {
    console.error('[FormulationController.getById]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch formulation', 500);
  }
};

// ── POST /api/v1/formulations ─────────────────────────────────────────────────

const create = async (req, res) => {
  const { elderlyId, labResultId, name, doctorNotes, items = [] } = req.body;
  if (!elderlyId) return failure(res, 'VALIDATION_ERROR', 'elderlyId required', 400);

  const orgId = BigInt(req.user.organizationId);
  try {
    // get next version number for this patient
    const lastFormulation = await prisma.formulation.findFirst({
      where: { elderlyId: BigInt(elderlyId), organizationId: orgId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (lastFormulation?.version ?? 0) + 1;

    const formulation = await prisma.formulation.create({
      data: {
        organizationId: orgId,
        elderlyId:      BigInt(elderlyId),
        labResultId:    labResultId ? BigInt(labResultId) : undefined,
        version,
        name,
        doctorNotes,
        createdBy:      BigInt(req.user.id),
        items: {
          create: items.map((item, idx) => ({
            ingredientId: BigInt(item.ingredientId),
            doseMg:       item.doseMg,
            frequency:    item.frequency,
            notes:        item.notes,
            sortOrder:    item.sortOrder ?? idx,
          })),
        },
      },
      include: { items: { include: { ingredient: { select: { name: true, unit: true } } }, orderBy: { sortOrder: 'asc' } } },
    });
    await createAuditLog({ userId: BigInt(req.user.id), action: 'CREATE', tableName: 'formulations', recordId: formulation.id, req });
    return success(res, serialize(formulation), 201);
  } catch (err) {
    console.error('[FormulationController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create formulation', 500);
  }
};

// ── PUT /api/v1/formulations/:id ──────────────────────────────────────────────

const update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  const { name, doctorNotes, labResultId, items } = req.body;
  try {
    const existing = await prisma.formulation.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Formulation not found', 404);

    const formulation = await prisma.$transaction(async (tx) => {
      if (items !== undefined) {
        await tx.formulationItem.deleteMany({ where: { formulationId: id } });
        if (items.length > 0) {
          await tx.formulationItem.createMany({
            data: items.map((item, idx) => ({
              formulationId: id,
              ingredientId:  BigInt(item.ingredientId),
              doseMg:        item.doseMg,
              frequency:     item.frequency ?? null,
              notes:         item.notes ?? null,
              sortOrder:     item.sortOrder ?? idx,
            })),
          });
        }
      }
      return tx.formulation.update({
        where: { id },
        data: {
          ...(name        !== undefined ? { name }        : {}),
          ...(doctorNotes !== undefined ? { doctorNotes } : {}),
          ...(labResultId !== undefined ? { labResultId: labResultId ? BigInt(labResultId) : null } : {}),
        },
        include: { items: { include: { ingredient: { select: { name: true, unit: true } } }, orderBy: { sortOrder: 'asc' } } },
      });
    });

    await createAuditLog({ userId: BigInt(req.user.id), action: 'UPDATE', tableName: 'formulations', recordId: id, req });
    return success(res, serialize(formulation));
  } catch (err) {
    console.error('[FormulationController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update formulation', 500);
  }
};

// ── POST /api/v1/formulations/:id/approve ────────────────────────────────────

const approve = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    const existing = await prisma.formulation.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Formulation not found', 404);

    const formulation = await prisma.formulation.update({
      where: { id },
      data: { approvedBy: BigInt(req.user.id), approvedAt: new Date() },
      include: { items: { include: { ingredient: { select: { name: true, unit: true } } }, orderBy: { sortOrder: 'asc' } } },
    });
    await createAuditLog({ userId: BigInt(req.user.id), action: 'UPDATE', tableName: 'formulations', recordId: id, req });
    return success(res, serialize(formulation));
  } catch (err) {
    console.error('[FormulationController.approve]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to approve formulation', 500);
  }
};

// ── POST /api/v1/formulations/:id/ai-recommend ───────────────────────────────

const aiRecommend = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  const orgId = BigInt(req.user.organizationId);

  try {
    const formulation = await prisma.formulation.findFirst({
      where: { id, organizationId: orgId },
      include: { items: { include: { ingredient: true } } },
    });
    if (!formulation) return failure(res, 'NOT_FOUND', 'Formulation not found', 404);

    // Gather patient context
    const [latestLab, allergies, medications, lifestyle] = await Promise.all([
      prisma.labResult.findFirst({
        where: { elderlyId: formulation.elderlyId },
        orderBy: { collectedAt: 'desc' },
      }),
      prisma.patientAllergy.findMany({
        where: { elderlyId: formulation.elderlyId, isActive: true },
      }),
      prisma.medication.findMany({
        where: { elderlyId: formulation.elderlyId, isActive: true },
        select: { medicationName: true, dosage: true },
      }),
      prisma.lifestyleLog.findMany({
        where: { elderlyId: formulation.elderlyId },
        orderBy: { logDate: 'desc' },
        take: 7,
      }),
    ]);

    // Get available ingredients for this org
    const ingredients = await prisma.ingredient.findMany({
      where: { organizationId: orgId, isActive: true },
      take: 100,
    });

    // Build Claude prompt
    const prompt = buildSupplementPrompt({ latestLab, allergies, medications, lifestyle, ingredients });

    let recommendation = { summary: '', suggestions: [] };
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic.default();
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = message.content[0]?.text ?? '';
      recommendation = parseAiResponse(text);
    } catch (aiErr) {
      console.warn('[FormulationController.aiRecommend] AI call failed, returning empty recommendation', aiErr.message);
    }

    // Save aiNotes to formulation
    await prisma.formulation.update({
      where: { id },
      data: { aiNotes: recommendation.summary },
    });

    return success(res, recommendation);
  } catch (err) {
    console.error('[FormulationController.aiRecommend]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to get AI recommendation', 500);
  }
};

function buildSupplementPrompt({ latestLab, allergies, medications, lifestyle, ingredients }) {
  const labSummary = latestLab
    ? `Latest lab results (${new Date(latestLab.collectedAt).toLocaleDateString('th-TH')}): ${JSON.stringify(latestLab.results).slice(0, 500)}`
    : 'No lab results available.';

  const allergySummary = allergies.length > 0
    ? `Allergies/contraindications: ${allergies.map((a) => `${a.allergen} (${a.severity})`).join(', ')}`
    : 'No known allergies.';

  const medSummary = medications.length > 0
    ? `Current medications: ${medications.map((m) => m.medicationName).join(', ')}`
    : 'No current medications.';

  const lifeSummary = lifestyle.length > 0
    ? `Recent lifestyle (last 7 days): avg mood ${(lifestyle.reduce((s, l) => s + (l.moodScore ?? 5), 0) / lifestyle.length).toFixed(1)}/10`
    : '';

  const ingList = ingredients.slice(0, 30).map((i) => `${i.name} (${i.unit}, ${i.minDoseMg ?? 0}-${i.maxDoseMg ?? 0} ${i.unit})`).join(', ');

  return `You are a clinical nutritionist AI. Analyze the following patient data and recommend supplements from the available catalog.

Patient Data:
- ${labSummary}
- ${allergySummary}
- ${medSummary}
- ${lifeSummary}

Available supplement ingredients: ${ingList}

Respond in JSON format:
{
  "summary": "2-3 sentence clinical summary in Thai",
  "suggestions": [
    {
      "ingredientName": "name from catalog",
      "recommendedDoseMg": number,
      "rationale": "brief reason in Thai",
      "priority": "HIGH|MEDIUM|LOW",
      "hasConflict": false
    }
  ]
}
Limit to top 5 suggestions.`;
}

function parseAiResponse(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* ignore */ }
  return { summary: text.slice(0, 500), suggestions: [] };
}

// ── POST /api/v1/formulations/:id/submit-oem ─────────────────────────────────

const submitToOem = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  const orgId = BigInt(req.user.organizationId);

  try {
    const formulation = await prisma.formulation.findFirst({
      where: { id, organizationId: orgId },
      include: { items: { include: { ingredient: true } } },
    });
    if (!formulation) return failure(res, 'NOT_FOUND', 'Formulation not found', 404);
    if (!formulation.approvedAt) return failure(res, 'VALIDATION_ERROR', 'Formulation must be approved before submitting to OEM', 400);

    const order = await prisma.oemOrder.create({
      data: {
        organizationId: orgId,
        elderlyId:      formulation.elderlyId,
        formulationId:  id,
        status:         'SUBMITTED',
        submittedAt:    new Date(),
        oemResponse:    { submittedBy: req.user.id, submittedAt: new Date() },
      },
    });

    // Log to integration log if OEM integration exists
    const oemIntegration = await prisma.integration.findFirst({
      where: { organizationId: orgId, integrationType: 'OEM', isActive: true },
    });
    if (oemIntegration) {
      await prisma.integrationLog.create({
        data: {
          integrationId:   oemIntegration.id,
          requestPayload:  { formulationId: id.toString(), items: formulation.items.length },
          responsePayload: { orderId: order.id.toString() },
          status:          'SUCCESS',
        },
      });
    }

    await createAuditLog({ userId: BigInt(req.user.id), action: 'CREATE', tableName: 'oem_orders', recordId: order.id, req });
    return success(res, serializeOemOrder(order), 201);
  } catch (err) {
    console.error('[FormulationController.submitToOem]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to submit OEM order', 500);
  }
};

// ── OEM Orders ────────────────────────────────────────────────────────────────

const listOemOrders = async (req, res) => {
  const { elderlyId, status, page = '1', limit = '20' } = req.query;
  const orgId   = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum= Math.min(100, parseInt(limit, 10) || 20);

  const where = {
    organizationId: orgId,
    ...(elderlyId ? { elderlyId: BigInt(elderlyId) } : {}),
    ...(status    ? { status }                        : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.oemOrder.findMany({ where, skip: (pageNum - 1) * limitNum, take: limitNum, orderBy: { createdAt: 'desc' } }),
      prisma.oemOrder.count({ where }),
    ]);
    return paginated(res, items.map(serializeOemOrder), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[FormulationController.listOemOrders]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch OEM orders', 500);
  }
};

const getOemOrder = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    const order = await prisma.oemOrder.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!order) return failure(res, 'NOT_FOUND', 'OEM order not found', 404);
    return success(res, serializeOemOrder(order));
  } catch (err) {
    console.error('[FormulationController.getOemOrder]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch OEM order', 500);
  }
};

module.exports = { list, getById, create, update, approve, aiRecommend, submitToOem, listOemOrders, getOemOrder };
