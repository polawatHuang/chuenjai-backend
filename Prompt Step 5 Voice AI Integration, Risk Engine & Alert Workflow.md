### Task 5: Voice AI Workflow, Risk Engine, and Alert Center Execution
Implement the intelligent automated pipeline matching the sequence design in the ADD.

Write the backend services for:
1. `src/services/voiceAi.service.ts`: Handles incoming transcripts from the Voice Gateway, interfaces with OpenAI API to generate next conversational turns, creates records in `calls`, `call_transcripts`, and summarizes long-term memory into `ai_conversations`.
2. `src/services/riskEngine.service.ts`: Reads health data metrics (missed medications, diseases, call sentiment scores) to calculate an automated `risk_score` and assigns a level (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
3. `src/services/alert.service.ts`: If the computed Risk Score exceeds the organization threshold (`system_settings.risk_threshold`), automatically generate a record in `alerts` with `status: "OPEN"`, assign an operator, and dispatch a high-priority payload to the notification worker for Caregivers/Officers via LINE Messaging API.