const prisma = require('../config/prisma');
const { success, failure } = require('../utils/response');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

// ── GET /api/v1/patients/:id/360 ─────────────────────────────────────────────
// Single endpoint that aggregates all patient data for the 360° profile

const getProfile360 = async (req, res) => {
  const id    = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  const orgId = BigInt(req.user.organizationId);

  try {
    const [
      elderly,
      latestLabResult,
      labResults,
      allergies,
      activeFormulation,
      formulations,
      activeSubscription,
      lifestyleLogs,
      consentSummary,
      latestRiskScore,
    ] = await Promise.all([
      prisma.elderly.findFirst({
        where: { id, organizationId: orgId },
        include: {
          diseases:          true,
          medications:       { where: { isActive: true } },
          caregivers:        { where: { isPrimary: true } },
          emergencyContacts: { orderBy: { priorityOrder: 'asc' }, take: 3 },
        },
      }),
      prisma.labResult.findFirst({
        where: { elderlyId: id, organizationId: orgId },
        orderBy: { collectedAt: 'desc' },
        include: { panel: { select: { panelName: true } } },
      }),
      prisma.labResult.findMany({
        where: { elderlyId: id, organizationId: orgId },
        orderBy: { collectedAt: 'desc' },
        take: 10,
        select: { id: true, collectedAt: true, status: true, labName: true, panelId: true },
      }),
      prisma.patientAllergy.findMany({
        where: { elderlyId: id, isActive: true },
        orderBy: { severity: 'asc' },
      }),
      prisma.formulation.findFirst({
        where: { elderlyId: id, organizationId: orgId, isActive: true },
        orderBy: { version: 'desc' },
        include: { items: { include: { ingredient: true }, orderBy: { sortOrder: 'asc' } } },
      }),
      prisma.formulation.findMany({
        where: { elderlyId: id, organizationId: orgId },
        orderBy: { version: 'desc' },
        take: 5,
        select: { id: true, version: true, name: true, approvedAt: true, createdAt: true },
      }),
      prisma.patientSubscription.findFirst({
        where: { elderlyId: id, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.lifestyleLog.findMany({
        where: { elderlyId: id },
        orderBy: { logDate: 'desc' },
        take: 14,
      }),
      prisma.consentRecord.findMany({
        where: { elderlyId: id, organizationId: orgId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.riskScore.findFirst({
        where: { elderlyId: id },
        orderBy: { calculatedAt: 'desc' },
      }),
    ]);

    if (!elderly) return failure(res, 'NOT_FOUND', 'Patient not found', 404);

    // Consent summary
    const consentMap = {};
    for (const r of consentSummary) {
      if (!consentMap[r.consentType]) {
        consentMap[r.consentType] = { latestAction: r.action, latestAt: r.createdAt };
      }
    }

    const serialize360 = (e) => ({
      id:           e.id.toString(),
      firstName:    e.firstName,
      lastName:     e.lastName,
      age:          e.age,
      gender:       e.gender,
      birthDate:    e.birthDate,
      phone:        e.phone,
      lineUserId:   e.lineUserId,
      bloodType:    e.bloodType,
      weight:       e.weight ? parseFloat(e.weight) : null,
      height:       e.height ? parseFloat(e.height) : null,
      status:       e.status,
      diseases:     e.diseases,
      medications:  e.medications.map((m) => ({ ...m, id: m.id.toString(), elderlyId: m.elderlyId.toString() })),
      primaryCaregiver: e.caregivers[0] ?? null,
      emergencyContacts: e.emergencyContacts,
    });

    return success(res, {
      patient:            serialize360(elderly),
      latestLabResult:    latestLabResult ? {
        id: latestLabResult.id.toString(), collectedAt: latestLabResult.collectedAt,
        status: latestLabResult.status, panelName: latestLabResult.panel?.panelName ?? null,
        results: latestLabResult.results, dnaData: latestLabResult.dnaData,
        hormoneData: latestLabResult.hormoneData,
      } : null,
      labHistory:         labResults.map((l) => ({ ...l, id: l.id.toString() })),
      allergies:          allergies.map((a) => ({ ...a, id: a.id.toString(), elderlyId: a.elderlyId.toString() })),
      activeFormulation:  activeFormulation ? {
        id: activeFormulation.id.toString(), version: activeFormulation.version,
        name: activeFormulation.name, aiNotes: activeFormulation.aiNotes,
        doctorNotes: activeFormulation.doctorNotes, approvedAt: activeFormulation.approvedAt,
        items: activeFormulation.items.map((item) => ({
          id: item.id.toString(), ingredientId: item.ingredientId.toString(),
          ingredientName: item.ingredient?.name ?? null,
          ingredientUnit: item.ingredient?.unit ?? 'mg',
          doseMg: parseFloat(item.doseMg), frequency: item.frequency,
        })),
      } : null,
      formulationHistory: formulations.map((f) => ({ ...f, id: f.id.toString(), elderlyId: id.toString() })),
      activeSubscription: activeSubscription ? {
        id: activeSubscription.id.toString(), planName: activeSubscription.planName,
        status: activeSubscription.status, stage: activeSubscription.stage,
        startDate: activeSubscription.startDate, renewalDueAt: activeSubscription.renewalDueAt,
        cycleDays: activeSubscription.cycleDays, priceThb: parseFloat(activeSubscription.priceThb),
        daysSinceStart: Math.floor((Date.now() - new Date(activeSubscription.startDate).getTime()) / 86400000),
      } : null,
      lifestyleLogs:      lifestyleLogs.map((l) => ({
        ...l, id: l.id.toString(), elderlyId: l.elderlyId.toString(),
        hrv: l.hrv ? parseFloat(l.hrv) : null,
      })),
      consent:            { summary: consentMap, hasActivePdpa: consentMap.PDPA?.latestAction === 'GIVEN' },
      riskScore:          latestRiskScore ? {
        score: latestRiskScore.score ? parseFloat(latestRiskScore.score) : null,
        riskLevel: latestRiskScore.riskLevel, calculatedAt: latestRiskScore.calculatedAt,
      } : null,
    });
  } catch (err) {
    console.error('[Patient360Controller.getProfile360]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch patient 360° profile', 500);
  }
};

module.exports = { getProfile360 };
