/**
 * Medication Reminder Cron  (SDS §7 Medication Reminder Flow)
 *
 * Scans active medications every minute, identifies those whose
 * scheduleTime falls within the current one-minute window, and pushes a
 * notification-queue job for each one that hasn't already been reminded today.
 *
 * ── Environment variables ───────────────────────────────────────────────────
 *   REMINDER_CRON_SCHEDULE   (default: "* * * * *"  — every minute)
 *   REMINDER_WINDOW_MINUTES  (default: 1  — look-ahead window in minutes)
 */
const cron   = require('node-cron');
const prisma = require('../config/prisma');
const { notificationQueue } = require('../queues/queues');

const CRON_SCHEDULE    = process.env.REMINDER_CRON_SCHEDULE   || '* * * * *';
const WINDOW_MINUTES   = parseInt(process.env.REMINDER_WINDOW_MINUTES || '1', 10);

// ── Time helpers ──────────────────────────────────────────────────────────────

function timeAnchor(d, plusMinutes = 0) {
  const totalMs = (d.getUTCHours() * 60 + d.getUTCMinutes() + plusMinutes) * 60 * 1000;
  return new Date(Math.max(0, Math.min(totalMs, 86399000)));
}

function utcDateKey(d) {
  return d.toISOString().slice(0, 10);
}

// ── Core scan ─────────────────────────────────────────────────────────────────

async function runMedicationReminder() {
  const now         = new Date();
  const windowStart = timeAnchor(now, 0);
  const windowEnd   = timeAnchor(now, WINDOW_MINUTES);
  const todayKey    = utcDateKey(now);

  let scanned   = 0;
  let dispatched = 0;
  let skipped    = 0;

  try {
    const medications = await prisma.medication.findMany({
      where: {
        isActive:    true,
        scheduleTime: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      include: {
        elderly: {
          select: {
            id:             true,
            firstName:      true,
            lastName:       true,
            phone:          true,
            lineUserId:     true,
            status:         true,
            organizationId: true,
          },
        },
      },
    });

    scanned = medications.length;
    if (!scanned) return;

    for (const med of medications) {
      const elderly = med.elderly;

      if (elderly.status !== 'ACTIVE') {
        skipped++;
        continue;
      }

      const dedupSubject = `med:reminder:${med.id}:${todayKey}`;

      const alreadySent = await prisma.notification.findFirst({
        where:  { elderlyId: elderly.id, subject: dedupSubject },
        select: { id: true },
      });

      if (alreadySent) {
        skipped++;
        continue;
      }

      const channel   = elderly.lineUserId ? 'LINE' : 'SMS';
      const recipient = elderly.lineUserId || elderly.phone;

      if (!recipient) {
        console.warn(
          `[MedReminder] Elderly ${elderly.id} has no LINE userId or phone — skipped`
        );
        skipped++;
        continue;
      }

      const medName  = med.medicationName || 'ยา';
      const dosage   = med.dosage ? ` (${med.dosage})` : '';
      const fullName = [elderly.firstName, elderly.lastName].filter(Boolean).join(' ') || 'คุณผู้สูงอายุ';
      const message  = `💊 ${fullName} ถึงเวลารับประทาน${medName}${dosage} กรุณาทานยาตามกำหนด`;

      let notification;
      try {
        notification = await prisma.notification.create({
          data: {
            elderlyId:      elderly.id,
            channel,
            recipient,
            subject:        dedupSubject,
            message,
            deliveryStatus: 'PENDING',
          },
        });
      } catch (dbErr) {
        console.error(`[MedReminder] Failed to create notification for med ${med.id}:`, dbErr.message);
        continue;
      }

      await notificationQueue.add(
        'medication-reminder',
        {
          notificationId: notification.id.toString(),
          elderlyId:      elderly.id.toString(),
          channel,
          recipient,
          subject:        dedupSubject,
          message,
          alertId:        null,
          callType:       null,
          organizationId: elderly.organizationId.toString(),
        },
        {
          priority: 5,
          jobId:    `med-reminder-${med.id}-${todayKey}`,
        }
      );

      dispatched++;
    }

    if (dispatched > 0 || skipped > 0) {
      console.log(
        `[MedReminder] window=${utcTimeStr(windowStart)}–${utcTimeStr(windowEnd)} ` +
        `scanned=${scanned} dispatched=${dispatched} skipped=${skipped}`
      );
    }
  } catch (err) {
    console.error('[MedReminder] Scan error:', err.message);
  }
}

function utcTimeStr(d) {
  return d.toISOString().slice(11, 16);
}

// ── Cron registration ─────────────────────────────────────────────────────────

let cronTask = null;

function start() {
  if (cronTask) return;

  cronTask = cron.schedule(CRON_SCHEDULE, runMedicationReminder, {
    scheduled: true,
    timezone:  'UTC',
  });

  console.log(
    `[MedReminder] Scheduler started — schedule: "${CRON_SCHEDULE}", ` +
    `window: ${WINDOW_MINUTES} min`
  );
}

function stop() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log('[MedReminder] Scheduler stopped');
  }
}

module.exports = { start, stop, runMedicationReminder };
