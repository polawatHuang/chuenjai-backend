/**
 * BullMQ Queue Instances
 *
 * All 5 queues defined in the SDS §9 (Queue Design) are instantiated here
 * so any module can import them without recreating connections.
 *
 * Queues (producers) add jobs; Workers (consumers) process them.
 * Import individual queues from this file wherever you need to enqueue work.
 */
const { Queue } = require('bullmq');
const { connection, defaultJobOptions } = require('./queue.config');

// ── Queue name constants ──────────────────────────────────────────────────────
// Centralised so queue names are never typed as bare strings across the codebase.

const QUEUE_NAMES = Object.freeze({
  VOICE_CALL:        'voice-call-queue',
  NOTIFICATION:      'notification-queue',
  RISK_CALCULATION:  'risk-calculation-queue',
  REPORT_GENERATION: 'report-generation-queue',
  INTEGRATION_SYNC:  'integration-sync-queue',
});

// ── Factory ───────────────────────────────────────────────────────────────────

function makeQueue(name) {
  return new Queue(name, {
    connection,
    defaultJobOptions,
  });
}

// ── Instances ─────────────────────────────────────────────────────────────────

const voiceCallQueue        = makeQueue(QUEUE_NAMES.VOICE_CALL);
const notificationQueue     = makeQueue(QUEUE_NAMES.NOTIFICATION);
const riskCalculationQueue  = makeQueue(QUEUE_NAMES.RISK_CALCULATION);
const reportGenerationQueue = makeQueue(QUEUE_NAMES.REPORT_GENERATION);
const integrationSyncQueue  = makeQueue(QUEUE_NAMES.INTEGRATION_SYNC);

// Emit a warning rather than crashing if Redis is unreachable at startup
[voiceCallQueue, notificationQueue, riskCalculationQueue, reportGenerationQueue, integrationSyncQueue]
  .forEach((q) => {
    q.on('error', (err) => {
      console.error(`[Queue:${q.name}] Connection error:`, err.message);
    });
  });

module.exports = {
  QUEUE_NAMES,
  voiceCallQueue,
  notificationQueue,
  riskCalculationQueue,
  reportGenerationQueue,
  integrationSyncQueue,
};
