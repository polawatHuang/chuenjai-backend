/**
 * BullMQ Redis Connection Configuration
 *
 * All queues and workers share this connection object.
 * ioredis (BullMQ's peer dependency) requires maxRetriesPerRequest: null
 * for blocking commands used internally by Workers.
 *
 * Environment variables:
 *   REDIS_HOST      (default: 127.0.0.1)
 *   REDIS_PORT      (default: 6379)
 *   REDIS_PASSWORD  (default: none)
 *   REDIS_DB        (default: 0)
 */
const connection = {
  host:                  process.env.REDIS_HOST     || '127.0.0.1',
  port:                  parseInt(process.env.REDIS_PORT || '6379', 10),
  password:              process.env.REDIS_PASSWORD || undefined,
  db:                    parseInt(process.env.REDIS_DB   || '0',    10),
  maxRetriesPerRequest:  null, // required by BullMQ Workers
  enableReadyCheck:      false,
};

/**
 * Default retry policy applied to every job unless overridden at add-time.
 *
 * 3 attempts with exponential back-off (2 s → 4 s → 8 s).
 * Completed jobs are kept (ring-buffer of 500) for BullMQ dashboard inspection.
 * Failed jobs are kept longer (2000) for post-mortem debugging.
 */
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type:  'exponential',
    delay: 2000,
  },
  removeOnComplete: { count: 500 },
  removeOnFail:     { count: 2000 },
};

module.exports = { connection, defaultJobOptions };
