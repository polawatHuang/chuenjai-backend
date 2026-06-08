const prisma = require('../config/prisma');
const { success, failure } = require('../utils/response');

/**
 * GET /api/v1/medication-center/summary
 * Returns all data needed by the Medication Center dashboard in one request.
 */
const summary = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);

  const now      = new Date();
  const today    = new Date(now); today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  try {
    const [totalActiveMeds, logs7d, activeMeds] = await Promise.all([
      // 1. Total active medications across the org
      prisma.medication.count({
        where: { elderly: { organizationId: orgId }, isActive: true },
      }),

      // 2. Medication logs for last 7 days (with elderly + medication details)
      prisma.medicationLog.findMany({
        where: {
          elderly:   { organizationId: orgId },
          createdAt: { gte: sevenDaysAgo },
        },
        include: {
          medication: { select: { medicationName: true, dosage: true, scheduleTime: true } },
          elderly:    { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // 3. Active medications with scheduleTime for today's schedule
      prisma.medication.findMany({
        where: {
          elderly:      { organizationId: orgId },
          isActive:     true,
          scheduleTime: { not: null },
        },
        select: {
          id:           true,
          medicationName: true,
          dosage:       true,
          frequency:    true,
          scheduleTime: true,
          elderly:      { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { scheduleTime: 'asc' },
        take: 60,
      }),
    ]);

    // ── Compliance stats ────────────────────────────────────────────────────────

    const taken7d  = logs7d.filter((l) => l.status === 'TAKEN').length;
    const missed7d = logs7d.filter((l) => l.status === 'MISSED').length;
    const compliancePct7d = taken7d + missed7d > 0
      ? parseFloat(((taken7d / (taken7d + missed7d)) * 100).toFixed(1))
      : null;

    const todayLogs   = logs7d.filter((l) => l.createdAt >= today);
    const missedToday = todayLogs.filter((l) => l.status === 'MISSED').length;

    // ── Per-elderly compliance (for at-risk list) ───────────────────────────────

    const elderlyMap = {};
    for (const log of logs7d) {
      const eid = log.elderlyId.toString();
      if (!elderlyMap[eid]) {
        elderlyMap[eid] = {
          elderlyId:   eid,
          firstName:   log.elderly.firstName,
          lastName:    log.elderly.lastName,
          phone:       log.elderly.phone,
          taken:  0,
          missed: 0,
          skipped: 0,
        };
      }
      if (log.status === 'TAKEN')   elderlyMap[eid].taken++;
      else if (log.status === 'MISSED')  elderlyMap[eid].missed++;
      else if (log.status === 'SKIPPED') elderlyMap[eid].skipped++;
    }

    const atRiskPatients = Object.values(elderlyMap)
      .map((e) => {
        const total = e.taken + e.missed;
        return {
          ...e,
          total,
          compliancePct: total > 0
            ? parseFloat(((e.taken / total) * 100).toFixed(1))
            : 100,
        };
      })
      .filter((e) => e.compliancePct < 75 && (e.taken + e.missed) > 0)
      .sort((a, b) => a.compliancePct - b.compliancePct)
      .slice(0, 10);

    // ── 7-day trend ─────────────────────────────────────────────────────────────

    const trend7d = [];
    for (let i = 6; i >= 0; i--) {
      const d    = new Date(now); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const dEnd = new Date(d);   dEnd.setHours(23, 59, 59, 999);
      const dayLogs = logs7d.filter((l) => l.createdAt >= d && l.createdAt <= dEnd);
      const t = dayLogs.filter((l) => l.status === 'TAKEN').length;
      const m = dayLogs.filter((l) => l.status === 'MISSED').length;
      trend7d.push({
        date:          d.toISOString().slice(0, 10),
        taken:         t,
        missed:        m,
        total:         t + m,
        compliancePct: t + m > 0 ? parseFloat(((t / (t + m)) * 100).toFixed(1)) : null,
      });
    }

    // ── Recent logs ─────────────────────────────────────────────────────────────

    const recentLogs = logs7d.slice(0, 20).map((l) => ({
      id:             l.id.toString(),
      elderlyId:      l.elderlyId.toString(),
      elderlyName:    `${l.elderly.firstName ?? ''} ${l.elderly.lastName ?? ''}`.trim(),
      elderlyPhone:   l.elderly.phone,
      medicationName: l.medication?.medicationName ?? null,
      dosage:         l.medication?.dosage ?? null,
      status:         l.status,
      source:         l.source,
      takenTime:      l.takenTime,
      scheduledTime:  l.scheduledTime,
      createdAt:      l.createdAt,
    }));

    // ── Today's schedule ────────────────────────────────────────────────────────

    const todayLogMap = new Map();
    for (const l of todayLogs) {
      todayLogMap.set(l.medicationId.toString(), l);
    }

    function fmtTime(t) {
      if (!t) return null;
      try {
        const d = new Date(t);
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
      } catch { return null; }
    }

    const todaySchedule = activeMeds.map((m) => {
      const log = todayLogMap.get(m.id.toString());
      return {
        id:             m.id.toString(),
        elderlyId:      m.elderly.id.toString(),
        elderlyName:    `${m.elderly.firstName ?? ''} ${m.elderly.lastName ?? ''}`.trim(),
        medicationName: m.medicationName,
        dosage:         m.dosage,
        frequency:      m.frequency,
        scheduleTime:   fmtTime(m.scheduleTime),
        status:         log ? log.status : 'PENDING',
      };
    });

    return success(res, {
      stats: {
        totalActiveMedications: totalActiveMeds,
        compliancePct7d,
        missedToday,
        atRiskCount:   atRiskPatients.length,
        taken7d,
        missed7d,
        totalLogs7d:   taken7d + missed7d,
      },
      trend7d,
      recentLogs,
      atRiskPatients,
      todaySchedule,
    });
  } catch (err) {
    console.error('[MedicationCenterController.summary]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch medication center data', 500);
  }
};

module.exports = { summary };
