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

  // ── Verify Redis is reachable before loading BullMQ workers ──────────────
  // On shared hosting (no Redis), workers would emit an uncaught ECONNREFUSED
  // and crash the process before their own error listeners could attach.
  const net = require('net');
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

  const probe = net.createConnection({ host: redisHost, port: redisPort });
  probe.setTimeout(2000);

  probe.on('connect', () => {
    probe.destroy();
    startWorkers();
  });

  probe.on('error', (err) => {
    probe.destroy();
    console.warn(
      `[Bootstrap] Redis not reachable at ${redisHost}:${redisPort} (${err.code ?? err.message}). ` +
      'Workers and queues are DISABLED. Set WORKERS_ENABLED=false to suppress this warning.'
    );
  });

  probe.on('timeout', () => {
    probe.destroy();
    console.warn(`[Bootstrap] Redis probe timed out at ${redisHost}:${redisPort}. Workers DISABLED.`);
  });
}

function startWorkers() {
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
