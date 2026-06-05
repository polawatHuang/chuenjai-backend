### Task 4: BullMQ Workers and Scheduler Infrastructure
Set up the asynchronous background processing layer using BullMQ and Redis as defined in the Software Design Specification.

Generate the code for:
1. `src/queues/queue.config.js`: Base Redis connection settings for BullMQ.
2. `src/jobs/voiceCall.worker.js`: Listens to `voice-call-queue` to fire outbound connections.
3. `src/jobs/notification.worker.js`: Processes multi-channel alerts (LINE OA, SMS, Email, Voice Call) based on the channel enum, updating the status in the `notifications` table.
4. `src/jobs/medicationReminder.cron.js`: A periodic cron simulation that runs daily/hourly to scan `medications`, check current scheduled time, and push reminder events into the notification queue.