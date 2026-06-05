/**
 * Worker & Cron Bootstrap
 *
 * Imports all BullMQ workers and cron jobs and starts them in-process.
 * This is called once from server.js so the monolith handles both
 * HTTP traffic and background work in a single PM2 process.
 *
 * Workers are only started when WORKERS_ENABLED !== 'false' so you can
 * disable them in environments that don't have Redis (e.g., CI).
 */

function bootstrap() {
  if (process.env.WORKERS_ENABLED === 'false') {
    console.log('[Bootstrap] Workers are disabled (WORKERS_ENABLED=false)');
    return;
  }

  // ── BullMQ Workers ────────────────────────────────────────────────────────
  require('./voiceCall.worker');
  require('./notification.worker');

  console.log('[Bootstrap] Workers started: voiceCall, notification');

  // ── Cron Jobs ─────────────────────────────────────────────────────────────
  const medicationReminder = require('./medicationReminder.cron');
  medicationReminder.start();

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  async function shutdown(signal) {
    console.log(`[Bootstrap] Received ${signal} — shutting down workers and crons gracefully…`);

    medicationReminder.stop();

    // Give in-flight BullMQ jobs a moment to finish
    setTimeout(() => process.exit(0), 3000);
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT',  () => shutdown('SIGINT'));
}

module.exports = { bootstrap };
