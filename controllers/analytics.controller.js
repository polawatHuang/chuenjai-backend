const prisma = require('../config/prisma');
const { success, failure } = require('../utils/response');

const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
const flt = (v) => v !== null && v !== undefined ? parseFloat(v.toString()) : null;

// ── GET /api/v1/analytics/summary ─────────────────────────────────────────────

const summary = async (req, res) => {
  const orgId  = BigInt(req.user.organizationId);
  const now    = new Date();
  const last7d  = new Date(now); last7d.setDate(last7d.getDate() - 7);
  const last14d = new Date(now); last14d.setDate(last14d.getDate() - 14);
  const last30d = new Date(now); last30d.setDate(last30d.getDate() - 30);

  try {
    const [allRiskScores, aiConvs30d, medLogs7d, alerts14d, elderly] = await Promise.all([
      prisma.riskScore.findMany({
        where:   { elderly: { organizationId: orgId } },
        orderBy: { calculatedAt: 'desc' },
        include: { elderly: { select: { id: true, firstName: true, lastName: true } } },
      }),

      prisma.aiConversation.findMany({
        where:   { elderly: { organizationId: orgId }, createdAt: { gte: last30d } },
        orderBy: { createdAt: 'asc' },
        include: { elderly: { select: { id: true, firstName: true, lastName: true } } },
      }),

      prisma.medicationLog.findMany({
        where: { elderly: { organizationId: orgId }, createdAt: { gte: last7d } },
        select: {
          elderlyId: true, status: true,
          elderly:   { select: { firstName: true, lastName: true } },
        },
      }),

      prisma.alert.findMany({
        where: {
          elderly:  { organizationId: orgId },
          createdAt:{ gte: last14d },
          severity: { in: ['HIGH', 'CRITICAL'] },
        },
        include: { elderly: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      }),

      prisma.elderly.findMany({
        where:  { organizationId: orgId, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);

    // ── Latest risk score per elderly ──────────────────────────────────────
    const latestRiskMap = {};
    for (const rs of allRiskScores) {
      const eid = rs.elderlyId.toString();
      if (!latestRiskMap[eid]) latestRiskMap[eid] = rs;
    }

    const riskDist = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const topRisk  = [];
    for (const [eid, rs] of Object.entries(latestRiskMap)) {
      const lvl = rs.riskLevel ?? 'LOW';
      if (riskDist[lvl] !== undefined) riskDist[lvl]++;
      topRisk.push({
        elderlyId:  eid,
        firstName:  rs.elderly.firstName,
        lastName:   rs.elderly.lastName,
        score:      flt(rs.score),
        riskLevel:  rs.riskLevel,
        aiSummary:  rs.aiSummary,
        calculatedAt: rs.calculatedAt,
      });
    }
    topRisk.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    // ── AI conversation analytics per elderly ──────────────────────────────
    const convMap = {};
    for (const c of aiConvs30d) {
      const eid = c.elderlyId.toString();
      if (!convMap[eid]) convMap[eid] = {
        firstName: c.elderly.firstName,
        lastName:  c.elderly.lastName,
        convs: [],
      };
      convMap[eid].convs.push(c);
    }

    const elderlyAI = {};
    for (const [eid, { firstName, lastName, convs }] of Object.entries(convMap)) {
      const latest = convs[convs.length - 1];
      const prev   = convs.length > 1 ? convs[convs.length - 2] : null;
      const s  = flt(latest.sentimentScore);
      const l  = flt(latest.lonelinessScore);
      const d  = flt(latest.depressionScore);
      const ps = flt(prev?.sentimentScore);
      const pl = flt(prev?.lonelinessScore);
      const pd = flt(prev?.depressionScore);
      elderlyAI[eid] = {
        firstName, lastName,
        sentimentScore:   s,
        lonelinessScore:  l,
        depressionScore:  d,
        sentimentTrend:   s && ps ? s - ps : null,
        lonelinessTrend:  l && pl ? l - pl : null,
        depressionTrend:  d && pd ? d - pd : null,
        convCount: convs.length,
      };
    }

    // ── Medication miss rate (7d) ─────────────────────────────────────────
    const medMap = {};
    for (const log of medLogs7d) {
      const eid = log.elderlyId.toString();
      if (!medMap[eid]) medMap[eid] = {
        firstName: log.elderly.firstName,
        lastName:  log.elderly.lastName,
        taken: 0, missed: 0, skipped: 0,
      };
      if (log.status === 'TAKEN')   medMap[eid].taken++;
      else if (log.status === 'MISSED')  medMap[eid].missed++;
      else                          medMap[eid].skipped++;
    }
    const medAtRisk = Object.entries(medMap)
      .map(([eid, d]) => {
        const total    = d.taken + d.missed + d.skipped;
        const missRate = total > 0 ? parseFloat(((d.missed / total) * 100).toFixed(1)) : 0;
        return { elderlyId: eid, ...d, missRate, total };
      })
      .filter(e => e.missRate > 25 || e.missed >= 3)
      .sort((a, b) => b.missRate - a.missRate)
      .slice(0, 10);

    // ── Depression / Loneliness at risk ───────────────────────────────────
    const depressionAtRisk = Object.entries(elderlyAI)
      .filter(([, a]) => a.depressionScore !== null && a.depressionScore > 0.45)
      .map(([eid, a]) => ({
        elderlyId: eid,
        firstName: a.firstName,
        lastName:  a.lastName,
        depressionScore: a.depressionScore,
        trend:     a.depressionTrend,
        convCount: a.convCount,
      }))
      .sort((a, b) => (b.depressionScore ?? 0) - (a.depressionScore ?? 0))
      .slice(0, 10);

    const lonelinessAtRisk = Object.entries(elderlyAI)
      .filter(([, a]) => a.lonelinessScore !== null && a.lonelinessScore > 0.45)
      .map(([eid, a]) => ({
        elderlyId: eid,
        firstName: a.firstName,
        lastName:  a.lastName,
        lonelinessScore: a.lonelinessScore,
        trend:     a.lonelinessTrend,
        convCount: a.convCount,
      }))
      .sort((a, b) => (b.lonelinessScore ?? 0) - (a.lonelinessScore ?? 0))
      .slice(0, 10);

    // ── ER / Alert risk (14d) ────────────────────────────────────────────
    const alertMap = {};
    for (const a of alerts14d) {
      const eid = a.elderlyId.toString();
      if (!alertMap[eid]) alertMap[eid] = {
        firstName: a.elderly.firstName,
        lastName:  a.elderly.lastName,
        critical: 0, high: 0, latestAt: null,
      };
      if (a.severity === 'CRITICAL') alertMap[eid].critical++;
      else                           alertMap[eid].high++;
      if (!alertMap[eid].latestAt || a.createdAt > alertMap[eid].latestAt)
        alertMap[eid].latestAt = a.createdAt;
    }
    const erAtRisk = Object.entries(alertMap)
      .map(([eid, d]) => ({
        elderlyId: eid, ...d,
        totalWeight: d.critical * 3 + d.high,
      }))
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 10);

    // ── 30-day trend ─────────────────────────────────────────────────────
    const dayBuckets = {};
    for (const c of aiConvs30d) {
      const key = c.createdAt.toISOString().slice(0, 10);
      if (!dayBuckets[key]) dayBuckets[key] = { s: [], l: [], d: [], r: [], n: 0 };
      dayBuckets[key].n++;
      if (c.sentimentScore)  dayBuckets[key].s.push(flt(c.sentimentScore));
      if (c.lonelinessScore) dayBuckets[key].l.push(flt(c.lonelinessScore));
      if (c.depressionScore) dayBuckets[key].d.push(flt(c.depressionScore));
      if (c.riskScore)       dayBuckets[key].r.push(flt(c.riskScore));
    }

    const trend30d = Array.from({ length: 30 }, (_, i) => {
      const dt  = new Date(now); dt.setDate(dt.getDate() - (29 - i));
      const key = dt.toISOString().slice(0, 10);
      const b   = dayBuckets[key];
      return {
        date:       key,
        sentiment:  b ? avg(b.s) : null,
        loneliness: b ? avg(b.l) : null,
        depression: b ? avg(b.d) : null,
        risk:       b ? avg(b.r) : null,
        callCount:  b?.n ?? 0,
      };
    });

    // ── AI Predictions ────────────────────────────────────────────────────
    const predictions = [];

    // Medication miss predictions
    for (const p of medAtRisk.slice(0, 4)) {
      if (p.missRate >= 50) {
        predictions.push({
          type: 'MEDICATION_MISS', elderlyId: p.elderlyId,
          name: `${p.firstName} ${p.lastName}`,
          confidence: Math.min(97, Math.round(40 + p.missRate * 0.6)),
          detail: `ลืมกินยา ${p.missRate.toFixed(0)}% ใน 7 วัน (${p.missed}/${p.total} ครั้ง)`,
          urgency: p.missRate >= 80 ? 'CRITICAL' : p.missRate >= 60 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    // Depression predictions
    for (const p of depressionAtRisk.slice(0, 3)) {
      const score = p.depressionScore ?? 0;
      if (score >= 0.55) {
        predictions.push({
          type: 'DEPRESSION', elderlyId: p.elderlyId,
          name: `${p.firstName} ${p.lastName}`,
          confidence: Math.round(score * 100),
          detail: `คะแนนซึมเศร้า ${(score * 100).toFixed(0)}%${p.trend && p.trend > 0.05 ? ' ↑ กำลังเพิ่มขึ้น' : ''}`,
          urgency: score >= 0.8 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    // Loneliness predictions
    for (const p of lonelinessAtRisk.slice(0, 3)) {
      const score = p.lonelinessScore ?? 0;
      if (score >= 0.65) {
        predictions.push({
          type: 'LONELINESS', elderlyId: p.elderlyId,
          name: `${p.firstName} ${p.lastName}`,
          confidence: Math.round(score * 100),
          detail: `คะแนนความโดดเดี่ยว ${(score * 100).toFixed(0)}%`,
          urgency: score >= 0.85 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    // ER predictions
    for (const p of erAtRisk.slice(0, 3)) {
      predictions.push({
        type: 'ER_VISIT', elderlyId: p.elderlyId,
        name: `${p.firstName} ${p.lastName}`,
        confidence: Math.min(95, 55 + p.totalWeight * 8),
        detail: `CRITICAL ${p.critical} + HIGH ${p.high} alerts ใน 14 วัน`,
        urgency: p.critical > 0 ? 'CRITICAL' : 'HIGH',
      });
    }

    // High risk from risk scores
    for (const p of topRisk.slice(0, 3)) {
      if (p.riskLevel === 'CRITICAL' && !predictions.some(pr => pr.elderlyId === p.elderlyId)) {
        predictions.push({
          type: 'HIGH_RISK', elderlyId: p.elderlyId,
          name: `${p.firstName} ${p.lastName}`,
          confidence: p.score ? Math.round(p.score * 100) : 85,
          detail: `Risk Score ${p.score?.toFixed(2) ?? '—'} — CRITICAL`,
          urgency: 'CRITICAL',
        });
      }
    }

    predictions.sort((a, b) => {
      const w = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 };
      const diff = (w[b.urgency] ?? 0) - (w[a.urgency] ?? 0);
      return diff !== 0 ? diff : b.confidence - a.confidence;
    });

    return success(res, {
      summary: {
        totalActive:       elderly.length,
        criticalCount:     riskDist.CRITICAL,
        highRiskCount:     riskDist.HIGH,
        medMissCount:      medAtRisk.length,
        depressionCount:   depressionAtRisk.length,
        lonelinessCount:   lonelinessAtRisk.length,
        erRiskCount:       erAtRisk.length,
        predictionCount:   predictions.length,
        aiCallsAnalyzed:   aiConvs30d.length,
      },
      riskDistribution: riskDist,
      topRisk:          topRisk.slice(0, 10),
      medAtRisk,
      depressionAtRisk,
      lonelinessAtRisk,
      erAtRisk,
      trend30d,
      predictions:      predictions.slice(0, 12),
    });
  } catch (err) {
    console.error('[AnalyticsController.summary]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch analytics', 500);
  }
};

// ── GET /api/v1/analytics/cohort-retention ────────────────────────────────────
const cohortRetention = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  try {
    const elderly = await prisma.elderly.findMany({
      where: { organizationId: orgId },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by month of join
    const cohorts = {};
    for (const e of elderly) {
      const key = e.createdAt.toISOString().slice(0, 7);
      if (!cohorts[key]) cohorts[key] = { cohortMonth: key, count: 0, ids: [] };
      cohorts[key].count++;
      cohorts[key].ids.push(e.id);
    }

    const rows = Object.values(cohorts)
      .sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth))
      .slice(-12)
      .map(c => ({ cohortMonth: c.cohortMonth, size: c.count, retention: [100] }));

    return success(res, { cohorts: rows });
  } catch (err) {
    console.error('[AnalyticsController.cohortRetention]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch cohort retention', 500);
  }
};

// ── GET /api/v1/analytics/clv ─────────────────────────────────────────────────
const clv = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  try {
    const subs = await prisma.patientSubscription.findMany({
      where: { elderly: { organizationId: orgId } },
      select: {
        id: true, elderlyId: true, status: true,
        priceThb: true, cycleDays: true, startDate: true,
        elderly: { select: { firstName: true, lastName: true } },
      },
      orderBy: { startDate: 'desc' },
    }).catch(() => []);

    const rows = subs.map(s => ({
      elderlyId:    s.elderlyId.toString(),
      firstName:    s.elderly.firstName,
      lastName:     s.elderly.lastName,
      status:       s.status,
      priceThb:     s.priceThb ? parseFloat(s.priceThb.toString()) : 0,
      cycleDays:    s.cycleDays,
      startDate:    s.startDate,
    }));
    return success(res, { clv: rows });
  } catch (err) {
    console.error('[AnalyticsController.clv]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch CLV', 500);
  }
};

// ── GET /api/v1/analytics/revenue ─────────────────────────────────────────────
const revenue = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  try {
    const now   = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }

    const subs = await prisma.patientSubscription.findMany({
      where: { elderly: { organizationId: orgId }, status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: { priceThb: true, startDate: true },
    }).catch(() => []);

    const mrrMap = {};
    for (const s of subs) {
      const key = s.startDate.toISOString().slice(0, 7);
      if (!mrrMap[key]) mrrMap[key] = 0;
      mrrMap[key] += s.priceThb ? parseFloat(s.priceThb.toString()) : 0;
    }

    const trend = months.map(m => ({ month: m, revenue: mrrMap[m] ?? 0 }));
    return success(res, { trend });
  } catch (err) {
    console.error('[AnalyticsController.revenue]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch revenue', 500);
  }
};

// ── GET /api/v1/analytics/inventory ──────────────────────────────────────────
const inventory = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  try {
    const ingredients = await prisma.ingredient.findMany({
      where: { organizationId: orgId },
      select: {
        id: true, name: true, unit: true,
        stockQuantity: true, reorderThreshold: true, costPerUnit: true,
      },
      orderBy: { name: 'asc' },
    }).catch(() => []);

    const rows = ingredients.map(i => ({
      id:               i.id.toString(),
      name:             i.name,
      unit:             i.unit,
      stockQuantity:    i.stockQuantity ? parseFloat(i.stockQuantity.toString()) : 0,
      reorderThreshold: i.reorderThreshold ? parseFloat(i.reorderThreshold.toString()) : 0,
      costPerUnit:      i.costPerUnit ? parseFloat(i.costPerUnit.toString()) : 0,
      status:           (i.stockQuantity ?? 0) <= (i.reorderThreshold ?? 0) ? 'LOW' : 'OK',
    }));
    return success(res, { inventory: rows });
  } catch (err) {
    console.error('[AnalyticsController.inventory]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch inventory', 500);
  }
};

module.exports = { summary, cohortRetention, clv, revenue, inventory };
