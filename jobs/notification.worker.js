/**
 * Notification Worker  (notification-queue)
 *
 * Dispatches notifications across four channels (SDS §5 Module 12):
 *   LINE OA   — push text message to elderly's LINE account
 *   SMS       — send SMS via Twilio (stub until credentials are configured)
 *   EMAIL     — send email via SMTP/nodemailer (stub until credentials are configured)
 *   VOICE_CALL — delegate to voice-call-queue (not dispatched inline)
 */
const { Worker } = require('bullmq');
const { connection } = require('../queues/queue.config');
const { QUEUE_NAMES, voiceCallQueue } = require('../queues/queues');
const prisma = require('../config/prisma');

// ── Channel dispatchers ───────────────────────────────────────────────────────

/**
 * LINE OA push message.
 * Client is created lazily so missing env vars don't crash the worker process
 * at startup — they only throw when a LINE job is actually processed.
 */
async function dispatchLine(recipient, message) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured in environment');
  }

  const { messagingApi } = require('@line/bot-sdk');
  const client = new messagingApi.MessagingApiClient({ channelAccessToken: token });

  await client.pushMessage({
    to:       recipient,
    messages: [{ type: 'text', text: message }],
  });
}

/**
 * SMS via Twilio.
 * Falls back to console log in development when credentials are absent.
 */
async function dispatchSms(phoneNumber, message) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;

  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER) {
    const twilio = require('twilio');
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await client.messages.create({
      to:   phoneNumber,
      from: TWILIO_FROM_NUMBER,
      body: message,
    });
  } else {
    console.log(`[SMS:DEV] To: ${phoneNumber} | ${message}`);
  }
}

/**
 * Email via SMTP (nodemailer).
 * Falls back to console log when SMTP_HOST is absent.
 */
async function dispatchEmail(recipient, subject, message) {
  if (process.env.SMTP_HOST) {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from:    process.env.SMTP_FROM || process.env.SMTP_USER,
      to:      recipient,
      subject: subject || 'Chuenjai AI Care — Notification',
      text:    message,
    });
  } else {
    console.log(`[EMAIL:DEV] To: ${recipient} | Subject: ${subject} | ${message}`);
  }
}

// ── Notification status helpers ───────────────────────────────────────────────

async function markSent(notificationId) {
  if (!notificationId) return;
  await prisma.notification.update({
    where: { id: BigInt(notificationId) },
    data:  { deliveryStatus: 'SENT', sentAt: new Date() },
  }).catch((err) => {
    console.warn(`[NotificationWorker] Could not mark notification ${notificationId} as SENT:`, err.message);
  });
}

async function markFailed(notificationId) {
  if (!notificationId) return;
  await prisma.notification.update({
    where: { id: BigInt(notificationId) },
    data:  { deliveryStatus: 'FAILED' },
  }).catch(() => {});
}

// ── Worker ────────────────────────────────────────────────────────────────────

const notificationWorker = new Worker(
  QUEUE_NAMES.NOTIFICATION,
  async (job) => {
    const {
      notificationId, elderlyId, channel, recipient,
      subject, message, alertId, callType, organizationId,
    } = job.data;

    if (!channel || !recipient || !message) {
      throw new Error('notification job is missing required fields: channel, recipient, message');
    }

    job.log(`Dispatching ${channel} notification to ${recipient}`);

    try {
      switch (channel) {

        case 'LINE':
          await dispatchLine(recipient, message);
          await markSent(notificationId);
          break;

        case 'SMS':
          await dispatchSms(recipient, message);
          await markSent(notificationId);
          break;

        case 'EMAIL':
          await dispatchEmail(recipient, subject, message);
          await markSent(notificationId);
          break;

        case 'VOICE_CALL':
          await voiceCallQueue.add(
            'outbound-call',
            {
              elderlyId,
              phoneNumber:    recipient,
              callType:       callType || 'HEALTH_CHECK',
              organizationId: organizationId ?? null,
              notificationId: notificationId ?? null,
            },
            {
              priority: alertId ? 1 : 5,
            }
          );
          job.log(`Delegated VOICE_CALL for elderly ${elderlyId} to voice-call-queue`);
          break;

        default:
          throw new Error(`Unknown notification channel: "${channel}"`);
      }

      return { channel, recipient, status: 'sent' };

    } catch (dispatchErr) {
      const isLastAttempt = (job.attemptsMade + 1) >= (job.opts?.attempts ?? 1);
      if (isLastAttempt) {
        await markFailed(notificationId);
      }
      throw dispatchErr;
    }
  },
  {
    connection,
    concurrency: parseInt(process.env.NOTIFICATION_CONCURRENCY || '10', 10),
  }
);

// ── Event handlers ────────────────────────────────────────────────────────────

notificationWorker.on('completed', (job, result) => {
  console.log(`[NotificationWorker] Job ${job.id} sent via ${result.channel} to ${result.recipient}`);
});

notificationWorker.on('failed', (job, err) => {
  console.error(
    `[NotificationWorker] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}):`,
    err.message
  );
});

notificationWorker.on('error', (err) => {
  console.error('[NotificationWorker] Worker error:', err.message);
});

module.exports = notificationWorker;
