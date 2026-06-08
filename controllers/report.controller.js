/**
 * Reports Controller — สปสช.-compatible report generation
 *
 * GET  /reports/summary                    — dashboard overview + recent jobs
 * GET  /reports/preview?type=&date=&month= — report data JSON (for preview)
 * GET  /reports/download/excel?type=&date= — stream XLSX file
 * GET  /reports/jobs                       — paginated report history
 */

const prisma = require('../config/prisma');
const XLSX   = require('xlsx');

// ── helpers ───────────────────────────────────────────────────────────────────

function startOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOf(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
function startOfMonth(year, month) {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}
function endOfMonth(year, month) {
  return new Date(year, month, 0, 23, 59, 59, 999);
}
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function fmtDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function pctStr(a, b) {
  if (!b) return '0%';
  return `${Math.round((a / b) * 100)}%`;
}

// ── buildReportData ───────────────────────────────────────────────────────────

async function buildReportData({ type, date, month, year, orgId }) {
  const oid = BigInt(orgId);

  // 1. Organisation info
  const org = await prisma.organization.findUnique({
    where:  { id: oid },
    select: { organizationName: true, province: true, phone: true, email: true },
  });

  if (type === 'DAILY') {
    // ── Daily report ────────────────────────────────────────────────────────
    const day   = date ? new Date(date) : new Date();
    const since = startOf(day);
    const until = endOf(day);

    const [elderly, calls, medLogs, alerts, appointments] = await Promise.all([
      prisma.elderly.findMany({
        where:  { organizationId: oid },
        select: {
          id: true, firstName: true, lastName: true, citizenId: true,
          age: true, phone: true, status: true,
          riskScores: {
            orderBy: { calculatedAt: 'desc' },
            take: 1,
            select: { score: true, riskLevel: true },
          },
        },
        orderBy: { firstName: 'asc' },
      }),
      prisma.call.findMany({
        where: {
          elderly: { organizationId: oid },
          startedAt: { gte: since, lte: until },
        },
        include: { elderly: { select: { firstName: true, lastName: true } } },
        orderBy: { startedAt: 'asc' },
      }),
      prisma.medicationLog.findMany({
        where: {
          elderly: { organizationId: oid },
          scheduledTime: { gte: since, lte: until },
        },
        include: {
          elderly:    { select: { firstName: true, lastName: true } },
          medication: { select: { medicationName: true, dosage: true } },
        },
        orderBy: { scheduledTime: 'asc' },
      }),
      prisma.alert.findMany({
        where: {
          elderly: { organizationId: oid },
          createdAt: { gte: since, lte: until },
        },
        include: { elderly: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.appointment.findMany({
        where: {
          elderly: { organizationId: oid },
          appointmentDatetime: { gte: since, lte: until },
        },
        include: { elderly: { select: { firstName: true, lastName: true } } },
        orderBy: { appointmentDatetime: 'asc' },
      }),
    ]);

    const activeElderly   = elderly.filter(e => e.status === 'ACTIVE');
    const callSuccess     = calls.filter(c => c.callStatus === 'SUCCESS').length;
    const callNoAnswer    = calls.filter(c => c.callStatus === 'NO_ANSWER').length;
    const callFailed      = calls.filter(c => c.callStatus === 'FAILED').length;
    const medTaken        = medLogs.filter(m => m.status === 'TAKEN').length;
    const medMissed       = medLogs.filter(m => m.status === 'MISSED').length;
    const criticalAlerts  = alerts.filter(a => a.severity === 'CRITICAL').length;
    const highAlerts      = alerts.filter(a => a.severity === 'HIGH').length;
    const missedAppts     = appointments.filter(a => a.status === 'MISSED').length;

    // AI Summary (rule-based)
    const aiInsights = generateAiSummary({
      type: 'DAILY', date: day,
      callTotal: calls.length, callSuccess, callNoAnswer,
      medTotal: medLogs.length, medTaken, medMissed,
      alertTotal: alerts.length, criticalAlerts, highAlerts,
      apptTotal: appointments.length, missedAppts,
      activeElderly: activeElderly.length,
    });

    return {
      type:  'DAILY',
      date:  day.toISOString().slice(0, 10),
      org,
      stats: {
        totalElderly:   elderly.length,
        activeElderly:  activeElderly.length,
        calls:          { total: calls.length, success: callSuccess, noAnswer: callNoAnswer, failed: callFailed },
        medications:    { total: medLogs.length, taken: medTaken, missed: medMissed, skipped: medLogs.length - medTaken - medMissed },
        alerts:         { total: alerts.length, critical: criticalAlerts, high: highAlerts, medium: alerts.filter(a => a.severity === 'MEDIUM').length, low: alerts.filter(a => a.severity === 'LOW').length },
        appointments:   { total: appointments.length, missed: missedAppts, scheduled: appointments.filter(a => a.status === 'SCHEDULED').length, completed: appointments.filter(a => a.status === 'COMPLETED').length },
      },
      aiInsights,
      elderly,
      calls:        calls.map(serializeCall),
      medLogs:      medLogs.map(serializeMedLog),
      alerts:       alerts.map(serializeAlert),
      appointments: appointments.map(serializeAppt),
    };

  } else if (type === 'MONTHLY') {
    // ── Monthly report ───────────────────────────────────────────────────────
    const m     = parseInt(month || String(new Date().getMonth() + 1), 10);
    const y     = parseInt(year  || String(new Date().getFullYear()), 10);
    const since = startOfMonth(y, m);
    const until = endOfMonth(y, m);

    const [elderly, calls, medLogs, alerts, appointments, notifications] = await Promise.all([
      prisma.elderly.findMany({
        where:  { organizationId: oid },
        select: {
          id: true, firstName: true, lastName: true, citizenId: true,
          age: true, phone: true, status: true, gender: true,
          diseases:  { select: { diseaseName: true }, take: 3 },
          riskScores: {
            orderBy: { calculatedAt: 'desc' },
            take: 1,
            select: { score: true, riskLevel: true },
          },
        },
        orderBy: { firstName: 'asc' },
      }),
      prisma.call.findMany({
        where: { elderly: { organizationId: oid }, startedAt: { gte: since, lte: until } },
        include: { elderly: { select: { firstName: true, lastName: true } } },
        orderBy: { startedAt: 'asc' },
      }),
      prisma.medicationLog.findMany({
        where: { elderly: { organizationId: oid }, scheduledTime: { gte: since, lte: until } },
        include: {
          elderly:    { select: { firstName: true, lastName: true } },
          medication: { select: { medicationName: true, dosage: true } },
        },
      }),
      prisma.alert.findMany({
        where: { elderly: { organizationId: oid }, createdAt: { gte: since, lte: until } },
        include: { elderly: { select: { firstName: true, lastName: true } } },
      }),
      prisma.appointment.findMany({
        where: { elderly: { organizationId: oid }, appointmentDatetime: { gte: since, lte: until } },
        include: { elderly: { select: { firstName: true, lastName: true } } },
      }),
      prisma.notification.findMany({
        where: { elderly: { organizationId: oid }, createdAt: { gte: since, lte: until } },
        select: { channel: true, deliveryStatus: true },
      }),
    ]);

    const activeElderly  = elderly.filter(e => e.status === 'ACTIVE').length;
    const callSuccess    = calls.filter(c => c.callStatus === 'SUCCESS').length;
    const medTaken       = medLogs.filter(m => m.status === 'TAKEN').length;
    const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL').length;
    const highAlerts     = alerts.filter(a => a.severity === 'HIGH').length;
    const resolvedAlerts = alerts.filter(a => a.status === 'RESOLVED' || a.status === 'CLOSED').length;
    const notifSent      = notifications.filter(n => n.deliveryStatus === 'SENT' || n.deliveryStatus === 'READ').length;
    const missedAppts    = appointments.filter(a => a.status === 'MISSED').length;

    const aiInsights = generateAiSummary({
      type: 'MONTHLY', month: m, year: y,
      callTotal: calls.length, callSuccess,
      medTotal: medLogs.length, medTaken, medMissed: medLogs.filter(m => m.status === 'MISSED').length,
      alertTotal: alerts.length, criticalAlerts, highAlerts, resolvedAlerts,
      apptTotal: appointments.length, missedAppts,
      activeElderly, notifSent,
    });

    // Build daily trend for the month
    const days = until.getDate();
    const dailyTrend = Array.from({ length: days }, (_, i) => {
      const d    = new Date(y, m - 1, i + 1);
      const dStr = d.toISOString().slice(0, 10);
      const dayCalls = calls.filter(c => c.startedAt?.toISOString().slice(0, 10) === dStr);
      const dayMeds  = medLogs.filter(ml => ml.scheduledTime?.toISOString().slice(0, 10) === dStr);
      return {
        date:          dStr,
        calls:         dayCalls.length,
        callSuccess:   dayCalls.filter(c => c.callStatus === 'SUCCESS').length,
        medTaken:      dayMeds.filter(m => m.status === 'TAKEN').length,
        medMissed:     dayMeds.filter(m => m.status === 'MISSED').length,
      };
    });

    return {
      type:  'MONTHLY',
      month: m,
      year:  y,
      org,
      stats: {
        totalElderly:   elderly.length,
        activeElderly,
        calls:         { total: calls.length, success: callSuccess, noAnswer: calls.filter(c => c.callStatus === 'NO_ANSWER').length, failed: calls.filter(c => c.callStatus === 'FAILED').length, successRate: calls.length > 0 ? Math.round((callSuccess / calls.length) * 100) : 0 },
        medications:   { total: medLogs.length, taken: medTaken, missed: medLogs.filter(m => m.status === 'MISSED').length, complianceRate: medLogs.length > 0 ? Math.round((medTaken / medLogs.length) * 100) : 0 },
        alerts:        { total: alerts.length, critical: criticalAlerts, high: highAlerts, resolved: resolvedAlerts, resolutionRate: alerts.length > 0 ? Math.round((resolvedAlerts / alerts.length) * 100) : 0 },
        appointments:  { total: appointments.length, completed: appointments.filter(a => a.status === 'COMPLETED').length, missed: missedAppts },
        notifications: { total: notifications.length, sent: notifSent },
      },
      aiInsights,
      dailyTrend,
      elderly,
      calls:        calls.map(serializeCall),
      medLogs:      medLogs.map(serializeMedLog),
      alerts:       alerts.map(serializeAlert),
      appointments: appointments.map(serializeAppt),
    };

  } else if (type === 'ELDERLY_LIST') {
    // ── Elderly roster ───────────────────────────────────────────────────────
    const elderly = await prisma.elderly.findMany({
      where:   { organizationId: oid },
      include: {
        diseases:    { select: { diseaseName: true, severity: true }, take: 5 },
        medications: { where: { isActive: true }, select: { medicationName: true, dosage: true, frequency: true }, take: 5 },
        caregivers:  { where: { isPrimary: true }, select: { fullName: true, phone: true, relationship: true } },
        riskScores:  { orderBy: { calculatedAt: 'desc' }, take: 1, select: { score: true, riskLevel: true, calculatedAt: true } },
      },
      orderBy: { firstName: 'asc' },
    });

    const byCritical = elderly.filter(e => e.riskScores[0]?.riskLevel === 'CRITICAL').length;
    const byHigh     = elderly.filter(e => e.riskScores[0]?.riskLevel === 'HIGH').length;
    const byActive   = elderly.filter(e => e.status === 'ACTIVE').length;

    return {
      type:  'ELDERLY_LIST',
      date:  new Date().toISOString().slice(0, 10),
      org,
      stats: {
        totalElderly: elderly.length,
        activeElderly: byActive,
        criticalRisk: byCritical,
        highRisk: byHigh,
      },
      aiInsights: [
        `ผู้สูงอายุทั้งหมด ${elderly.length} ราย ในระบบ`,
        `ACTIVE ${byActive} ราย | ความเสี่ยงวิกฤต ${byCritical} ราย | ความเสี่ยงสูง ${byHigh} ราย`,
        byHigh + byCritical > 0
          ? `ควรติดตามผู้สูงอายุกลุ่มเสี่ยง ${byHigh + byCritical} รายอย่างใกล้ชิด`
          : 'ไม่พบผู้สูงอายุกลุ่มเสี่ยงสูงในขณะนี้',
      ],
      elderly: elderly.map(e => ({
        id:           e.id.toString(),
        citizenId:    e.citizenId,
        firstName:    e.firstName,
        lastName:     e.lastName,
        age:          e.age,
        gender:       e.gender,
        phone:        e.phone,
        address:      e.address,
        status:       e.status,
        diseases:     e.diseases.map(d => d.diseaseName).join(', '),
        medications:  e.medications.map(m => `${m.medicationName} ${m.dosage}`).join(' | '),
        caregiver:    e.caregivers[0]?.fullName ?? null,
        caregiverPhone: e.caregivers[0]?.phone ?? null,
        riskLevel:    e.riskScores[0]?.riskLevel ?? null,
        riskScore:    e.riskScores[0]?.score ?? null,
      })),
    };
  }

  return null;
}

// ── serializiers ──────────────────────────────────────────────────────────────

function serializeCall(c) {
  return {
    id:              c.id.toString(),
    elderlyName:     `${c.elderly?.firstName ?? ''} ${c.elderly?.lastName ?? ''}`.trim(),
    callType:        c.callType,
    callStatus:      c.callStatus,
    startedAt:       c.startedAt,
    durationSeconds: c.durationSeconds,
  };
}
function serializeMedLog(m) {
  return {
    id:            m.id.toString(),
    elderlyName:   `${m.elderly?.firstName ?? ''} ${m.elderly?.lastName ?? ''}`.trim(),
    medication:    m.medication?.medicationName ?? null,
    dosage:        m.medication?.dosage ?? null,
    scheduledTime: m.scheduledTime,
    takenTime:     m.takenTime,
    status:        m.status,
  };
}
function serializeAlert(a) {
  return {
    id:          a.id.toString(),
    elderlyName: `${a.elderly?.firstName ?? ''} ${a.elderly?.lastName ?? ''}`.trim(),
    alertType:   a.alertType,
    severity:    a.severity,
    title:       a.title,
    status:      a.status,
    createdAt:   a.createdAt,
  };
}
function serializeAppt(a) {
  return {
    id:          a.id.toString(),
    elderlyName: `${a.elderly?.firstName ?? ''} ${a.elderly?.lastName ?? ''}`.trim(),
    hospitalName: a.hospitalName,
    department:   a.department,
    doctorName:   a.doctorName,
    appointmentDatetime: a.appointmentDatetime,
    purpose:     a.purpose,
    status:      a.status,
  };
}

// ── AI Insights (rule-based Thai) ─────────────────────────────────────────────

function generateAiSummary(p) {
  const insights = [];
  const callRate = p.callTotal > 0 ? Math.round((p.callSuccess / p.callTotal) * 100) : null;
  const medRate  = p.medTotal  > 0 ? Math.round((p.medTaken   / p.medTotal)  * 100) : null;

  if (p.type === 'DAILY') {
    const dateStr = p.date ? fmtDate(p.date) : 'วันนี้';
    insights.push(
      `📊 สรุปผล${dateStr}: ดูแลผู้สูงอายุ ACTIVE ${p.activeElderly} ราย`,
    );
    if (callRate !== null) {
      insights.push(
        callRate >= 90 ? `✅ โทรติดตาม ${p.callTotal} สาย อัตราสำเร็จ ${callRate}% — ดีเยี่ยม`
        : callRate >= 70 ? `⚠️ โทรติดตาม ${p.callTotal} สาย อัตราสำเร็จ ${callRate}% — ควรติดตามผู้ที่ไม่รับสาย`
        : `🔴 โทรติดตาม ${p.callTotal} สาย อัตราสำเร็จ ${callRate}% — ต่ำกว่าเกณฑ์ ควรตรวจสอบ`,
      );
    }
    if (medRate !== null) {
      insights.push(
        medRate >= 90 ? `✅ ความครอบคลุมการกินยา ${medRate}% — ดีมาก`
        : medRate >= 75 ? `⚠️ ความครอบคลุมการกินยา ${medRate}% — ควรกระตุ้นผู้ที่ลืม`
        : `🔴 ความครอบคลุมการกินยา ${medRate}% — ต่ำกว่าเกณฑ์ 75% ต้องดำเนินการ`,
      );
    }
    if (p.criticalAlerts > 0) {
      insights.push(`🚨 พบเหตุการณ์วิกฤต ${p.criticalAlerts} ราย — ต้องการการดูแลเร่งด่วน`);
    }
    if (p.missedAppts > 0) {
      insights.push(`📅 ขาดนัดพบแพทย์ ${p.missedAppts} ราย — ควรนัดหมายใหม่`);
    }
    if (!p.criticalAlerts && callRate && callRate >= 80 && medRate && medRate >= 80) {
      insights.push('💚 ภาพรวมวันนี้อยู่ในเกณฑ์ดี ผู้สูงอายุได้รับการดูแลครบถ้วน');
    }
  } else if (p.type === 'MONTHLY') {
    const THAI_MONTHS = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const monthName = THAI_MONTHS[p.month] ?? '';
    insights.push(`📊 รายงานประจำเดือน ${monthName} ${p.year + 543}: ผู้สูงอายุ ACTIVE ${p.activeElderly} ราย`);
    if (p.notifSent) {
      insights.push(`📨 ส่งการแจ้งเตือนทั้งสิ้น ${p.notifSent} ครั้ง ครอบคลุม LINE, SMS`);
    }
    if (callRate !== null) {
      insights.push(
        callRate >= 85 ? `✅ อัตราการโทรสำเร็จ ${callRate}% (${p.callSuccess}/${p.callTotal} สาย) — ผ่านเกณฑ์ สปสช.`
        : `⚠️ อัตราการโทรสำเร็จ ${callRate}% (${p.callSuccess}/${p.callTotal} สาย) — ต่ำกว่าเป้า 85%`,
      );
    }
    if (medRate !== null) {
      insights.push(
        medRate >= 80 ? `✅ อัตราการกินยาตรงเวลา ${medRate}% — ผ่านเกณฑ์ สปสช.`
        : `⚠️ อัตราการกินยาตรงเวลา ${medRate}% — ต่ำกว่าเป้า 80% ของ สปสช.`,
      );
    }
    if (p.resolvedAlerts !== undefined) {
      const resRate = p.alertTotal > 0 ? Math.round((p.resolvedAlerts / p.alertTotal) * 100) : 0;
      insights.push(`🔔 Alert ${p.alertTotal} เหตุการณ์ แก้ไขแล้ว ${p.resolvedAlerts} ราย (${resRate}%)`);
    }
    if (p.criticalAlerts > 0) {
      insights.push(`🚨 เหตุการณ์วิกฤต ${p.criticalAlerts} ราย — บันทึกเพื่อรายงาน สปสช.`);
    }
    insights.push('📋 รายงานนี้จัดทำโดยระบบ AI ชื่นใจ สำหรับส่ง สปสช. ตามรอบการรายงาน');
  }

  return insights;
}

// ── buildExcel ────────────────────────────────────────────────────────────────

function buildExcel(data) {
  const wb = XLSX.utils.book_new();

  // ─ Helper to add sheet ───────────────────────────────────────────────────
  function addSheet(name, rows, cols) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Column widths
    ws['!cols'] = cols.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  const ORG  = data.org?.organizationName ?? 'องค์กร';
  const DATE = data.date ?? `${data.year}-${String(data.month).padStart(2, '0')}`;

  // Sheet 1: หน้าปก / Cover
  const coverRows = [
    [''],
    ['ระบบ AI ชื่นใจ — รายงานสปสช.'],
    [''],
    ['องค์กร:', ORG],
    ['ประเภทรายงาน:', data.type === 'DAILY' ? 'รายงานประจำวัน' : data.type === 'MONTHLY' ? 'รายงานประจำเดือน' : 'ทะเบียนผู้สูงอายุ'],
    data.type === 'DAILY'   ? ['วันที่:', fmtDate(data.date)] :
    data.type === 'MONTHLY' ? ['เดือน/ปี:', `${data.month}/${data.year}`] :
                              ['วันที่สร้าง:', fmtDate(new Date())],
    ['สร้างเมื่อ:', fmtDateTime(new Date())],
    [''],
    ['สรุปสถิติหลัก:'],
    data.stats.totalElderly  != null ? ['- ผู้สูงอายุทั้งหมด:', String(data.stats.totalElderly) + ' ราย'] : null,
    data.stats.activeElderly != null ? ['- ผู้สูงอายุ ACTIVE:', String(data.stats.activeElderly) + ' ราย'] : null,
    data.stats.calls         ? ['- การโทรทั้งหมด:', `${data.stats.calls.total} สาย (สำเร็จ ${data.stats.calls.success} สาย)`] : null,
    data.stats.medications   ? ['- การกินยา:', `ครบ ${data.stats.medications.taken ?? data.stats.medications.compliance ?? 0} / ${data.stats.medications.total} ครั้ง`] : null,
    data.stats.alerts        ? ['- การแจ้งเตือน:', `${data.stats.alerts.total} เหตุการณ์ (วิกฤต ${data.stats.alerts.critical})`] : null,
    [''],
    ['AI Insights:'],
    ...(data.aiInsights ?? []).map(ins => ['', ins]),
    [''],
    ['หมายเหตุ:', 'รายงานนี้สร้างโดย AI ชื่นใจ เพื่อใช้รายงานต่อ สปสช.'],
  ].filter(Boolean);
  addSheet('หน้าปก', coverRows, [20, 60]);

  // Sheet 2: สรุปสถิติ
  if (data.stats) {
    const s = data.stats;
    const statRows = [
      ['หมวดหมู่', 'รายการ', 'จำนวน', 'หมายเหตุ'],
      ['ผู้สูงอายุ', 'ทั้งหมด', s.totalElderly, ''],
      ['ผู้สูงอายุ', 'ACTIVE', s.activeElderly, ''],
    ];
    if (s.calls) {
      statRows.push(
        ['การโทรติดตาม', 'ทั้งหมด', s.calls.total, ''],
        ['การโทรติดตาม', 'สำเร็จ', s.calls.success, pctStr(s.calls.success, s.calls.total)],
        ['การโทรติดตาม', 'ไม่รับสาย', s.calls.noAnswer, pctStr(s.calls.noAnswer, s.calls.total)],
        ['การโทรติดตาม', 'ล้มเหลว', s.calls.failed, pctStr(s.calls.failed, s.calls.total)],
      );
    }
    if (s.medications) {
      statRows.push(
        ['การกินยา', 'ทั้งหมด', s.medications.total, ''],
        ['การกินยา', 'กินยาครบ', s.medications.taken, pctStr(s.medications.taken, s.medications.total)],
        ['การกินยา', 'ลืมกินยา', s.medications.missed, pctStr(s.medications.missed, s.medications.total)],
      );
    }
    if (s.alerts) {
      statRows.push(
        ['การแจ้งเตือน', 'ทั้งหมด', s.alerts.total, ''],
        ['การแจ้งเตือน', 'CRITICAL', s.alerts.critical, ''],
        ['การแจ้งเตือน', 'HIGH', s.alerts.high, ''],
      );
    }
    if (s.appointments) {
      statRows.push(
        ['นัดหมอ', 'ทั้งหมด', s.appointments.total, ''],
        ['นัดหมอ', 'ขาดนัด', s.appointments.missed, ''],
      );
    }
    addSheet('สรุปสถิติ', statRows, [20, 20, 12, 20]);
  }

  // Sheet 3: ทะเบียนผู้สูงอายุ
  if (data.elderly?.length > 0) {
    const rows = [
      ['ลำดับ', 'เลขบัตรปชช.', 'ชื่อ-สกุล', 'อายุ', 'เบอร์โทร', 'สถานะ', 'ระดับความเสี่ยง', 'คะแนนความเสี่ยง'],
    ];
    data.elderly.forEach((e, i) => {
      const rs = e.riskScores?.[0] ?? e;
      rows.push([
        i + 1,
        e.citizenId ?? '',
        `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim(),
        e.age ?? '',
        e.phone ?? '',
        e.status ?? '',
        rs.riskLevel ?? e.riskLevel ?? '',
        rs.score ?? e.riskScore ?? '',
      ]);
    });
    addSheet('ทะเบียนผู้สูงอายุ', rows, [8, 20, 24, 8, 16, 12, 18, 14]);
  }

  // Sheet 4: บันทึกการโทร
  if (data.calls?.length > 0) {
    const rows = [
      ['ลำดับ', 'ชื่อผู้สูงอายุ', 'ประเภทการโทร', 'ผลการโทร', 'วันเวลา', 'ระยะเวลา (วินาที)'],
    ];
    data.calls.forEach((c, i) => {
      rows.push([
        i + 1,
        c.elderlyName,
        c.callType ?? '',
        c.callStatus ?? 'กำลังโทร',
        fmtDateTime(c.startedAt),
        c.durationSeconds ?? '',
      ]);
    });
    addSheet('บันทึกการโทร', rows, [8, 24, 18, 14, 22, 18]);
  }

  // Sheet 5: การกินยา
  if (data.medLogs?.length > 0) {
    const rows = [
      ['ลำดับ', 'ชื่อผู้สูงอายุ', 'ชื่อยา', 'ขนาดยา', 'เวลาที่กำหนด', 'เวลาที่กินจริง', 'สถานะ'],
    ];
    data.medLogs.forEach((m, i) => {
      rows.push([
        i + 1,
        m.elderlyName,
        m.medication ?? '',
        m.dosage ?? '',
        fmtDateTime(m.scheduledTime),
        m.takenTime ? fmtDateTime(m.takenTime) : '—',
        m.status === 'TAKEN' ? 'กินแล้ว' : m.status === 'MISSED' ? 'ลืมกิน' : 'ข้าม',
      ]);
    });
    addSheet('การกินยา', rows, [8, 24, 24, 14, 22, 22, 12]);
  }

  // Sheet 6: การแจ้งเตือน
  if (data.alerts?.length > 0) {
    const rows = [
      ['ลำดับ', 'ชื่อผู้สูงอายุ', 'ประเภท Alert', 'ระดับความรุนแรง', 'หัวข้อ', 'สถานะ', 'วันที่'],
    ];
    data.alerts.forEach((a, i) => {
      rows.push([
        i + 1,
        a.elderlyName,
        a.alertType ?? '',
        a.severity ?? '',
        a.title ?? '',
        a.status ?? '',
        fmtDateTime(a.createdAt),
      ]);
    });
    addSheet('การแจ้งเตือน', rows, [8, 24, 18, 18, 36, 14, 22]);
  }

  // Monthly: additional daily trend sheet
  if (data.type === 'MONTHLY' && data.dailyTrend) {
    const rows = [
      ['วันที่', 'การโทร', 'โทรสำเร็จ', 'อัตราสำเร็จ', 'กินยาครบ', 'ลืมกินยา'],
    ];
    data.dailyTrend.forEach(d => {
      rows.push([
        d.date,
        d.calls,
        d.callSuccess,
        d.calls > 0 ? `${Math.round((d.callSuccess / d.calls) * 100)}%` : '—',
        d.medTaken,
        d.medMissed,
      ]);
    });
    addSheet('แนวโน้มรายวัน', rows, [14, 10, 12, 14, 12, 12]);
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

// ── Routes ────────────────────────────────────────────────────────────────────

async function summary(req, res) {
  try {
    const orgId = BigInt(req.user.organizationId);

    const [totalElderly, callsToday, alertsOpen, recentJobs, org] = await Promise.all([
      prisma.elderly.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      prisma.call.count({
        where: {
          elderly: { organizationId: orgId },
          startedAt: { gte: startOf(new Date()), lte: endOf(new Date()) },
        },
      }),
      prisma.alert.count({ where: { elderly: { organizationId: orgId }, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.reportJob.findMany({
        where:   { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take:    20,
        include: { generator: { select: { fullName: true } } },
      }),
      prisma.organization.findUnique({
        where:  { id: orgId },
        select: { organizationName: true, province: true },
      }),
    ]);

    return res.json({
      success: true,
      data: {
        quickStats: { totalElderly, callsToday, alertsOpen },
        org,
        recentJobs: recentJobs.map(j => ({
          id:           j.id.toString(),
          reportType:   j.reportType,
          parameters:   j.parameters,
          status:       j.status,
          fileUrl:      j.fileUrl,
          generatedBy:  j.generator?.fullName ?? null,
          generatedAt:  j.generatedAt,
          createdAt:    j.createdAt,
        })),
      },
    });
  } catch (err) {
    console.error('[ReportController] summary error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function previewData(req, res) {
  try {
    const { type = 'DAILY', date, month, year } = req.query;
    const orgId = req.user.organizationId;
    const data  = await buildReportData({ type, date, month, year, orgId });
    if (!data) return res.status(400).json({ success: false, message: 'Invalid report type' });
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[ReportController] previewData error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function downloadExcel(req, res) {
  try {
    const { type = 'DAILY', date, month, year } = req.query;
    const orgId = req.user.organizationId;

    const data = await buildReportData({ type, date, month, year, orgId });
    if (!data) return res.status(400).json({ success: false, message: 'Invalid report type' });

    const buffer = buildExcel(data);

    const label  = type === 'DAILY'   ? `daily_${date ?? new Date().toISOString().slice(0, 10)}`
                 : type === 'MONTHLY' ? `monthly_${year}_${month}`
                 : `elderly_list_${new Date().toISOString().slice(0, 10)}`;
    const filename = `chuenjai_report_${label}.xlsx`;

    // Record report job
    const userId = req.user.id ? BigInt(req.user.id) : undefined;
    await prisma.reportJob.create({
      data: {
        organizationId: BigInt(orgId),
        reportType:     type,
        parameters:     { type, date, month, year },
        status:         'COMPLETED',
        generatedBy:    userId ?? null,
        generatedAt:    new Date(),
      },
    }).catch(() => {});

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    console.error('[ReportController] downloadExcel error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function listJobs(req, res) {
  try {
    const orgId    = BigInt(req.user.organizationId);
    const page     = Math.max(1, parseInt(req.query.page ?? '1', 10));
    const limit    = Math.min(50, parseInt(req.query.limit ?? '10', 10));
    const skip     = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.reportJob.findMany({
        where:   { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        skip,
        take:    limit,
        include: { generator: { select: { fullName: true } } },
      }),
      prisma.reportJob.count({ where: { organizationId: orgId } }),
    ]);

    return res.json({
      success: true,
      data: rows.map(j => ({
        id:          j.id.toString(),
        reportType:  j.reportType,
        parameters:  j.parameters,
        status:      j.status,
        generatedBy: j.generator?.fullName ?? null,
        generatedAt: j.generatedAt,
        createdAt:   j.createdAt,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[ReportController] listJobs error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { summary, previewData, downloadExcel, listJobs };
