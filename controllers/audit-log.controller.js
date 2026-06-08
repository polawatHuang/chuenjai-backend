/**
 * Audit Log Controller
 *
 * GET  /audit-logs          — paginated list with filters
 * GET  /audit-logs/summary  — stats + recent critical activity
 * GET  /audit-logs/export   — CSV download
 */

const prisma = require('../config/prisma');

// ── Action metadata ────────────────────────────────────────────────────────────

const ACTION_RISK = {
  DELETE:         3,
  EXPORT:         2,
  BULK_DELETE:    3,
  RESET_PASSWORD: 3,
  TOGGLE_USER:    2,
  UPDATE:         1,
  CREATE:         1,
  LOGIN:          0,
  LOGOUT:         0,
  REFRESH:        0,
  VIEW:           0,
};

function riskLevel(action) {
  const score = ACTION_RISK[action?.toUpperCase()] ?? 1;
  if (score >= 3) return 'HIGH';
  if (score >= 2) return 'MEDIUM';
  return 'LOW';
}

// ── Serializer ────────────────────────────────────────────────────────────────

function serializeLog(row) {
  return {
    id:        row.id.toString(),
    userId:    row.userId?.toString() ?? null,
    userName:  row.user?.fullName    ?? null,
    userRole:  row.user?.role        ?? null,
    action:    row.action,
    tableName: row.tableName,
    recordId:  row.recordId?.toString() ?? null,
    oldData:   row.oldData,
    newData:   row.newData,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    riskLevel: riskLevel(row.action),
    createdAt: row.createdAt,
  };
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────

async function summary(req, res) {
  try {
    const orgId = BigInt(req.user.organizationId);

    // Org user IDs
    const orgUserIds = await prisma.user.findMany({
      where:  { organizationId: orgId },
      select: { id: true },
    }).then(rows => rows.map(r => r.id));

    if (!orgUserIds.length) {
      return res.json({
        success: true,
        data: {
          totalToday: 0, totalWeek: 0, totalMonth: 0,
          highRiskToday: 0, uniqueUsers: 0, uniqueIps: 0,
          actionBreakdown: {}, recentActivity: [], topUsers: [], suspiciousIps: [],
        },
      });
    }

    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const week  = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const month = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);

    const base = { userId: { in: orgUserIds } };

    const [totalToday, totalWeek, totalMonth, recentRows, allMonth] = await Promise.all([
      prisma.auditLog.count({ where: { ...base, createdAt: { gte: today } } }),
      prisma.auditLog.count({ where: { ...base, createdAt: { gte: week  } } }),
      prisma.auditLog.count({ where: { ...base, createdAt: { gte: month } } }),
      prisma.auditLog.findMany({
        where:   { ...base },
        orderBy: { createdAt: 'desc' },
        take:    20,
        include: { user: { select: { fullName: true, role: true } } },
      }),
      prisma.auditLog.findMany({
        where:   { ...base, createdAt: { gte: month } },
        select:  { action: true, ipAddress: true, userId: true, createdAt: true },
      }),
    ]);

    // Action breakdown
    const actionBreakdown = {};
    for (const r of allMonth) {
      const a = r.action ?? 'UNKNOWN';
      actionBreakdown[a] = (actionBreakdown[a] ?? 0) + 1;
    }

    // Unique users & IPs (this month)
    const uniqueUsers = new Set(allMonth.map(r => r.userId?.toString()).filter(Boolean)).size;
    const uniqueIps   = new Set(allMonth.map(r => r.ipAddress).filter(Boolean)).size;

    // High-risk today
    const highRiskToday = recentRows.filter(
      r => r.createdAt >= today && riskLevel(r.action) === 'HIGH'
    ).length;

    // Top users this month
    const userCountMap = {};
    for (const r of allMonth) {
      if (r.userId) {
        const k = r.userId.toString();
        userCountMap[k] = (userCountMap[k] ?? 0) + 1;
      }
    }
    const topUserIds = Object.entries(userCountMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => BigInt(id));

    const topUserDetails = await prisma.user.findMany({
      where:  { id: { in: topUserIds } },
      select: { id: true, fullName: true, role: true },
    });
    const topUsers = topUserDetails.map(u => ({
      userId:   u.id.toString(),
      fullName: u.fullName,
      role:     u.role,
      count:    userCountMap[u.id.toString()] ?? 0,
    })).sort((a, b) => b.count - a.count);

    // Suspicious IPs: >50 requests this month OR multiple failed logins
    const ipCountMap = {};
    for (const r of allMonth) {
      if (r.ipAddress) {
        ipCountMap[r.ipAddress] = (ipCountMap[r.ipAddress] ?? 0) + 1;
      }
    }
    const suspiciousIps = Object.entries(ipCountMap)
      .filter(([, c]) => c > 50)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ip, count]) => ({ ip, count }));

    return res.json({
      success: true,
      data: {
        totalToday,
        totalWeek,
        totalMonth,
        highRiskToday,
        uniqueUsers,
        uniqueIps,
        actionBreakdown,
        recentActivity: recentRows.map(serializeLog),
        topUsers,
        suspiciousIps,
      },
    });
  } catch (err) {
    console.error('[AuditLog] summary:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// ── LIST (paginated) ──────────────────────────────────────────────────────────

async function list(req, res) {
  try {
    const orgId = BigInt(req.user.organizationId);

    const page   = Math.max(1, parseInt(req.query.page   ?? '1',  10));
    const limit  = Math.min(100, parseInt(req.query.limit ?? '50', 10));
    const skip   = (page - 1) * limit;

    const { action, tableName, userId, risk, search, from, to } = req.query;

    // Org user IDs
    const orgUserIds = await prisma.user.findMany({
      where:  { organizationId: orgId },
      select: { id: true },
    }).then(rows => rows.map(r => r.id));

    const where = {
      userId: { in: orgUserIds.length ? orgUserIds : [BigInt(0)] },
    };

    if (action)    where.action    = { equals: action.toUpperCase() };
    if (tableName) where.tableName = { equals: tableName };
    if (userId)    where.userId    = BigInt(userId);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to + 'T23:59:59');
    }

    // Risk filter — post-filter since riskLevel is computed
    let riskFilter = null;
    if (risk && ['HIGH', 'MEDIUM', 'LOW'].includes(risk.toUpperCase())) {
      riskFilter = risk.toUpperCase();
      // map risk → actions
      const highActions   = Object.entries(ACTION_RISK).filter(([,v]) => v >= 3).map(([k]) => k);
      const mediumActions = Object.entries(ACTION_RISK).filter(([,v]) => v >= 2 && v < 3).map(([k]) => k);
      if (riskFilter === 'HIGH')   where.action = { in: highActions };
      if (riskFilter === 'MEDIUM') where.action = { in: mediumActions };
      if (riskFilter === 'LOW')    where.action = { notIn: [...Object.entries(ACTION_RISK).filter(([,v]) => v >= 2).map(([k]) => k)] };
    }

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { fullName: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return res.json({
      success: true,
      data:    rows.map(serializeLog),
      meta:    { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[AuditLog] list:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// ── EXPORT CSV ────────────────────────────────────────────────────────────────

async function exportCsv(req, res) {
  try {
    const orgId = BigInt(req.user.organizationId);

    const { action, tableName, from, to } = req.query;

    const orgUserIds = await prisma.user.findMany({
      where:  { organizationId: orgId },
      select: { id: true },
    }).then(rows => rows.map(r => r.id));

    const where = {
      userId: { in: orgUserIds.length ? orgUserIds : [BigInt(0)] },
    };
    if (action)    where.action    = action.toUpperCase();
    if (tableName) where.tableName = tableName;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to + 'T23:59:59');
    }

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    10000,
      include: { user: { select: { fullName: true, role: true } } },
    });

    // Build CSV
    const headers = ['ID', 'Timestamp', 'User', 'Role', 'Action', 'Table', 'Record ID', 'IP Address', 'Risk Level', 'Old Data', 'New Data', 'User Agent'];
    const escape = v => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const lines = [
      headers.join(','),
      ...rows.map(r => [
        r.id.toString(),
        r.createdAt.toISOString(),
        r.user?.fullName ?? '',
        r.user?.role     ?? '',
        r.action         ?? '',
        r.tableName      ?? '',
        r.recordId?.toString() ?? '',
        r.ipAddress      ?? '',
        riskLevel(r.action),
        r.oldData ? JSON.stringify(r.oldData) : '',
        r.newData ? JSON.stringify(r.newData) : '',
        r.userAgent ?? '',
      ].map(escape).join(',')),
    ];

    const csvBuffer = Buffer.from('﻿' + lines.join('\n'), 'utf-8'); // BOM for Thai chars in Excel

    const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', csvBuffer.length);
    return res.send(csvBuffer);
  } catch (err) {
    console.error('[AuditLog] exportCsv:', err);
    return res.status(500).json({ success: false, message: 'Export failed' });
  }
}

module.exports = { summary, list, exportCsv };
