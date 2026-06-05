/**
 * Risk Engine Service
 *
 * Computes a composite risk score (0–100) for an elderly by aggregating:
 *   • Disease burden         — severity-weighted count of chronic conditions
 *   • Medication compliance  — missed/skipped doses in last 7 days
 *   • Appointment compliance — missed appointments in last 30 days
 *   • Call responsiveness    — failed/no-answer calls in last 7 days
 *   • AI conversation scores — sentiment, loneliness, depression, AI-assessed risk
 *
 * Risk levels:
 *   0–24  → LOW
 *   25–49 → MEDIUM
 *   50–74 → HIGH
 *   75–100 → CRITICAL
 */

const prisma = require('../config/prisma');

const WEIGHTS = {
  disease:    { HIGH: 25, MEDIUM: 12, LOW: 5, cap: 40 },
  medication: { perMiss: 8,  cap: 24 },
  appointment:{ perMiss: 10, cap: 20 },
  call:       { perFail: 8,  cap: 16 },
  ai: {
    sentimentNegativeStrong: 15,
    sentimentNegativeWeak:    7,
    loneliness:               8,
    depression:               8,
    aiRiskHigh:              10,
    cap:                     30,
  },
};

const LOOKBACK_7D  = 7  * 24 * 60 * 60 * 1000;
const LOOKBACK_30D = 30 * 24 * 60 * 60 * 1000;

function scoreToLevel(score) {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

/**
 * Full risk calculation for one elderly.
 *
 * @param {string} elderlyId
 * @param {string} organizationId
 * @returns {{ score, riskLevel, factors, riskScoreId }}
 */
async function calculateForElderly(elderlyId, organizationId) {
  const eid = BigInt(elderlyId);
  const now = new Date();

  const [
    diseases,
    missedMedCount,
    missedApptCount,
    failedCallCount,
    latestAiConv,
    orgThresholdSetting,
  ] = await Promise.all([
    prisma.disease.findMany({
      where:  { elderlyId: eid },
      select: { severity: true },
    }),

    prisma.medicationLog.count({
      where: {
        elderlyId: eid,
        status:    { in: ['MISSED', 'SKIPPED'] },
        createdAt: { gte: new Date(now.getTime() - LOOKBACK_7D) },
      },
    }),

    prisma.appointment.count({
      where: {
        elderlyId:           eid,
        status:              'MISSED',
        appointmentDatetime: { gte: new Date(now.getTime() - LOOKBACK_30D) },
      },
    }),

    prisma.call.count({
      where: {
        elderlyId:  eid,
        callStatus: { in: ['FAILED', 'NO_ANSWER'] },
        createdAt:  { gte: new Date(now.getTime() - LOOKBACK_7D) },
      },
    }),

    prisma.aiConversation.findFirst({
      where:   { elderlyId: eid },
      orderBy: { createdAt: 'desc' },
      select: {
        sentimentScore:  true,
        lonelinessScore: true,
        depressionScore: true,
        riskScore:       true,
      },
    }),

    organizationId
      ? prisma.systemSetting.findFirst({
          where:  { organizationId: BigInt(organizationId), settingKey: 'risk_threshold' },
          select: { settingValue: true },
        })
      : Promise.resolve(null),
  ]);

  const factors = {};
  let rawScore = 0;

  // 1. Disease burden
  let diseasePoints = 0;
  diseases.forEach((d) => {
    if      (d.severity === 'HIGH')   diseasePoints += WEIGHTS.disease.HIGH;
    else if (d.severity === 'MEDIUM') diseasePoints += WEIGHTS.disease.MEDIUM;
    else if (d.severity === 'LOW')    diseasePoints += WEIGHTS.disease.LOW;
  });
  diseasePoints = Math.min(diseasePoints, WEIGHTS.disease.cap);
  rawScore += diseasePoints;
  factors.diseasePoints   = diseasePoints;
  factors.diseaseCount    = diseases.length;
  factors.diseaseSeverities = diseases.map((d) => d.severity);

  // 2. Medication compliance
  const medPoints = Math.min(missedMedCount * WEIGHTS.medication.perMiss, WEIGHTS.medication.cap);
  rawScore += medPoints;
  factors.missedMedications = missedMedCount;
  factors.medPoints         = medPoints;

  // 3. Appointment compliance
  const apptPoints = Math.min(missedApptCount * WEIGHTS.appointment.perMiss, WEIGHTS.appointment.cap);
  rawScore += apptPoints;
  factors.missedAppointments = missedApptCount;
  factors.apptPoints         = apptPoints;

  // 4. Call responsiveness
  const callPoints = Math.min(failedCallCount * WEIGHTS.call.perFail, WEIGHTS.call.cap);
  rawScore += callPoints;
  factors.failedCalls  = failedCallCount;
  factors.callPoints   = callPoints;

  // 5. AI conversation scores
  let aiPoints = 0;
  if (latestAiConv) {
    const s = latestAiConv.sentimentScore  ?? 0;
    const l = latestAiConv.lonelinessScore ?? 0;
    const d = latestAiConv.depressionScore ?? 0;
    const r = latestAiConv.riskScore       ?? 0;

    if      (s < -0.5) aiPoints += WEIGHTS.ai.sentimentNegativeStrong;
    else if (s < 0)    aiPoints += WEIGHTS.ai.sentimentNegativeWeak;

    if (l > 0.7) aiPoints += WEIGHTS.ai.loneliness;
    if (d > 0.7) aiPoints += WEIGHTS.ai.depression;
    if (r > 0.7) aiPoints += WEIGHTS.ai.aiRiskHigh;

    aiPoints = Math.min(aiPoints, WEIGHTS.ai.cap);

    factors.sentimentScore  = s;
    factors.lonelinessScore = l;
    factors.depressionScore = d;
    factors.aiRiskScore     = r;
    factors.aiPoints        = aiPoints;
  }
  rawScore += aiPoints;

  const score     = Math.max(0, Math.min(Math.round(rawScore), 100));
  const riskLevel = scoreToLevel(score);

  factors.totalScore = score;
  factors.riskLevel  = riskLevel;

  const riskScoreRow = await prisma.riskScore.create({
    data: {
      elderlyId:    eid,
      score,
      riskLevel,
      factors,
      calculatedAt: now,
    },
  });

  const orgThreshold = extractThresholdValue(orgThresholdSetting?.settingValue)
    ?? parseInt(process.env.DEFAULT_RISK_THRESHOLD || '50', 10);

  if (score >= orgThreshold && (riskLevel === 'HIGH' || riskLevel === 'CRITICAL')) {
    const alertService = require('./alert.service');
    alertService
      .createFromRiskScore({ elderlyId, organizationId, score, riskLevel, factors })
      .catch((err) => console.error('[RiskEngine] Alert dispatch failed:', err.message));
  }

  return {
    score,
    riskLevel,
    factors,
    riskScoreId: riskScoreRow.id.toString(),
  };
}

/**
 * Re-score all active elderlies in one organisation.
 *
 * @param {string} organizationId
 * @returns {{ processed: number, errors: number }}
 */
async function calculateBatchForOrganization(organizationId) {
  const elderlies = await prisma.elderly.findMany({
    where:  { organizationId: BigInt(organizationId), status: 'ACTIVE' },
    select: { id: true },
  });

  let processed = 0;
  let errors    = 0;

  for (const elderly of elderlies) {
    try {
      await calculateForElderly(elderly.id.toString(), organizationId);
      processed++;
    } catch (err) {
      console.error(`[RiskEngine.batch] Failed for elderly ${elderly.id}:`, err.message);
      errors++;
    }
  }

  return { processed, errors };
}

function extractThresholdValue(jsonValue) {
  if (jsonValue === null || jsonValue === undefined) return null;
  if (typeof jsonValue === 'object' && 'value' in jsonValue) {
    return Number(jsonValue.value);
  }
  const n = Number(jsonValue);
  return isNaN(n) ? null : n;
}

module.exports = { calculateForElderly, calculateBatchForOrganization, scoreToLevel };
