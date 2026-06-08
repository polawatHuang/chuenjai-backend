/**
 * Notification Center Controller
 * GET /notifications/summary   — channel stats, delivery rate, 7-day trend
 * GET /notifications           — paginated list with channel/status filters
 * POST /notifications/:id/retry — re-enqueue a FAILED notification
 */

const prisma = require('../config/prisma');

// Try to import queue; degrade gracefully if workers are disabled
let notificationQueue = null;
try {
  notificationQueue = require('../queues/queues').notificationQueue;
} catch {}

// ── helpers ───────────────────────────────────────────────────────────────────

function serialize(n) {
  return {
    id:             n.id.toString(),
    elderlyId:      n.elderlyId?.toString() ?? null,
    alertId:        n.alertId?.toString()   ?? null,
    elderlyName:    n.elderly
      ? `${n.elderly.firstName ?? ''} ${n.elderly.lastName ?? ''}`.trim()
      : null,
    elderlyPhone:   n.elderly?.phone ?? null,
    channel:        n.channel,
    recipient:      n.recipient,
    subject:        n.subject,
    message:        n.message,
    deliveryStatus: n.deliveryStatus,
    sentAt:         n.sentAt,
    createdAt:      n.createdAt,
  };
}

function daysAgo(d) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt;
}

// ── summary ───────────────────────────────────────────────────────────────────

async function summary(req, res) {
  try {
    const [
      totalCounts,
      channelCounts,
      trend7d,
    ] = await Promise.all([
      // Total by status
      prisma.notification.groupBy({
        by: ['deliveryStatus'],
        _count: { id: true },
      }),

      // Count by channel × status
      prisma.notification.groupBy({
        by: ['channel', 'deliveryStatus'],
        _count: { id: true },
      }),

      // Last 7 days: group by date × status
      (async () => {
        const since = daysAgo(6);
        since.setHours(0, 0, 0, 0);
        const rows = await prisma.notification.findMany({
          where: { createdAt: { gte: since } },
          select: {
            channel:        true,
            deliveryStatus: true,
            createdAt:      true,
          },
          orderBy: { createdAt: 'asc' },
        });
        // Build 7-day array
        const days = [];
        for (let i = 6; i >= 0; i--) {
          const d = daysAgo(i);
          days.push({
            date:    d.toISOString().slice(0, 10),
            sent:    0,
            failed:  0,
            pending: 0,
            line:    0,
            sms:     0,
          });
        }
        rows.forEach(r => {
          const key = r.createdAt.toISOString().slice(0, 10);
          const day = days.find(d => d.date === key);
          if (!day) return;
          if (r.deliveryStatus === 'SENT' || r.deliveryStatus === 'READ') day.sent++;
          if (r.deliveryStatus === 'FAILED')  day.failed++;
          if (r.deliveryStatus === 'PENDING') day.pending++;
          if (r.channel === 'LINE') day.line++;
          if (r.channel === 'SMS')  day.sms++;
        });
        return days;
      })(),
    ]);

    // Build status map
    const statusMap = { PENDING: 0, SENT: 0, FAILED: 0, READ: 0 };
    totalCounts.forEach(r => { statusMap[r.deliveryStatus] = r._count.id; });

    // Build channel map { LINE: {SENT, FAILED, PENDING, READ}, SMS: {...}, ... }
    const channels = { LINE: {}, SMS: {}, EMAIL: {}, VOICE_CALL: {} };
    Object.keys(channels).forEach(ch => {
      channels[ch] = { SENT: 0, FAILED: 0, PENDING: 0, READ: 0, total: 0 };
    });
    channelCounts.forEach(r => {
      if (!r.channel) return;
      if (!channels[r.channel]) channels[r.channel] = { SENT: 0, FAILED: 0, PENDING: 0, READ: 0, total: 0 };
      channels[r.channel][r.deliveryStatus] = r._count.id;
      channels[r.channel].total += r._count.id;
    });

    // Overall delivery rate
    const total   = statusMap.SENT + statusMap.READ + statusMap.FAILED + statusMap.PENDING;
    const sent    = statusMap.SENT + statusMap.READ;
    const failed  = statusMap.FAILED;
    const pending = statusMap.PENDING;
    const deliveryRate = total > 0 ? Math.round((sent / (sent + failed)) * 100) || 0 : 0;

    // Recent failures (last 5)
    const recentFailed = await prisma.notification.findMany({
      where:   { deliveryStatus: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take:    5,
      include: { elderly: { select: { firstName: true, lastName: true, phone: true } } },
    });

    return res.json({
      success: true,
      data: {
        stats: {
          total,
          sent,
          failed,
          pending,
          deliveryRate,
        },
        channels,
        trend7d,
        recentFailed: recentFailed.map(serialize),
      },
    });
  } catch (err) {
    console.error('[NotificationController] summary error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// ── list ──────────────────────────────────────────────────────────────────────

async function list(req, res) {
  try {
    const {
      channel,
      status,
      search,
      page  = '1',
      limit = '20',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page,  10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip     = (pageNum - 1) * limitNum;

    const where = {};
    if (channel) where.channel = channel;
    if (status)  where.deliveryStatus = status;
    if (search) {
      where.OR = [
        { recipient: { contains: search } },
        { message:   { contains: search } },
        { subject:   { contains: search } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: { elderly: { select: { firstName: true, lastName: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.notification.count({ where }),
    ]);

    return res.json({
      success: true,
      data:    rows.map(serialize),
      meta:    { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error('[NotificationController] list error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// ── retry ─────────────────────────────────────────────────────────────────────

async function retry(req, res) {
  try {
    const id = BigInt(req.params.id);
    const notification = await prisma.notification.findUnique({
      where:   { id },
      include: { elderly: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    if (notification.deliveryStatus !== 'FAILED') {
      return res.status(400).json({ success: false, message: 'Only FAILED notifications can be retried' });
    }

    // Reset to PENDING
    const updated = await prisma.notification.update({
      where: { id },
      data:  { deliveryStatus: 'PENDING', sentAt: null },
    });

    // Re-enqueue if queue is available
    if (notificationQueue) {
      await notificationQueue.add('send-notification', {
        notificationId: notification.id.toString(),
        elderlyId:      notification.elderlyId?.toString(),
        channel:        notification.channel,
        recipient:      notification.recipient,
        subject:        notification.subject,
        message:        notification.message,
      }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    }

    return res.json({
      success: true,
      data: {
        id:             updated.id.toString(),
        deliveryStatus: updated.deliveryStatus,
        message:        'Notification queued for retry',
      },
    });
  } catch (err) {
    console.error('[NotificationController] retry error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// ── retryAll ──────────────────────────────────────────────────────────────────

async function retryAll(req, res) {
  try {
    const failed = await prisma.notification.findMany({
      where: { deliveryStatus: 'FAILED' },
      take:  50,
    });

    let queued = 0;
    for (const n of failed) {
      await prisma.notification.update({
        where: { id: n.id },
        data:  { deliveryStatus: 'PENDING', sentAt: null },
      });
      if (notificationQueue) {
        await notificationQueue.add('send-notification', {
          notificationId: n.id.toString(),
          elderlyId:      n.elderlyId?.toString(),
          channel:        n.channel,
          recipient:      n.recipient,
          subject:        n.subject,
          message:        n.message,
        }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
      }
      queued++;
    }

    return res.json({
      success: true,
      data: { queued, message: `${queued} notifications queued for retry` },
    });
  } catch (err) {
    console.error('[NotificationController] retryAll error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { summary, list, retry, retryAll };
