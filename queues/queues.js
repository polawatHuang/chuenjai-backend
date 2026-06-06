const { Queue } = require('bullmq');
const { connection, defaultJobOptions } = require('./queue.config');

const QUEUE_NAMES = Object.freeze({
  VOICE_CALL:        'voice-call-queue',
  NOTIFICATION:      'notification-queue',
  RISK_CALCULATION:  'risk-calculation-queue',
  REPORT_GENERATION: 'report-generation-queue',
  INTEGRATION_SYNC:  'integration-sync-queue',
});

// In test/disabled environments skip Redis connections entirely
const disabled = process.env.WORKERS_ENABLED === 'false' || process.env.NODE_ENV === 'test';

function makeQueue(name) {
  if (disabled) {
    return { name, add: async () => ({ id: 'stub' }), on: () => {} };
  }
  const q = new Queue(name, { connection, defaultJobOptions });
  q.on('error', (err) => {
    console.error(`[Queue:${q.name}] Connection error:`, err.message);
  });
  return q;
}

const voiceCallQueue        = makeQueue(QUEUE_NAMES.VOICE_CALL);
const notificationQueue     = makeQueue(QUEUE_NAMES.NOTIFICATION);
const riskCalculationQueue  = makeQueue(QUEUE_NAMES.RISK_CALCULATION);
const reportGenerationQueue = makeQueue(QUEUE_NAMES.REPORT_GENERATION);
const integrationSyncQueue  = makeQueue(QUEUE_NAMES.INTEGRATION_SYNC);

module.exports = {
  QUEUE_NAMES,
  voiceCallQueue,
  notificationQueue,
  riskCalculationQueue,
  reportGenerationQueue,
  integrationSyncQueue,
};
