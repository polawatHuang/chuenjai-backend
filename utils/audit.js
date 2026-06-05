const prisma = require('../config/prisma');

/**
 * Write an immutable audit log entry (FR-16).
 *
 * Failures are swallowed with a console error — an audit write must never
 * abort the main business transaction.
 *
 * @param {object} opts
 * @param {bigint|string|number|null} opts.userId
 * @param {string}  opts.action      - e.g. 'LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT'
 * @param {string}  opts.tableName   - target table name
 * @param {bigint|string|number|null} [opts.recordId]
 * @param {object|null} [opts.oldData]
 * @param {object|null} [opts.newData]
 * @param {import('express').Request} [opts.req]
 */
async function createAuditLog({ userId, action, tableName, recordId, oldData, newData, req }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId:    userId    ? BigInt(userId)    : null,
        action,
        tableName,
        recordId:  recordId  ? BigInt(recordId)  : null,
        oldData:   oldData   ?? null,
        newData:   newData   ?? null,
        ipAddress: normalizeIp(req?.ip ?? req?.socket?.remoteAddress),
        userAgent: req?.headers?.['user-agent'] ?? null,
      },
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write entry:', err.message);
  }
}

function normalizeIp(ip) {
  if (!ip) return null;
  // Strip IPv4-mapped IPv6 prefix (::ffff:192.168.1.1 → 192.168.1.1)
  return ip.replace(/^::ffff:/, '');
}

module.exports = { createAuditLog };
