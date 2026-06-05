# Software Design Specification (SDS)

# Chuenjai AI Care Platform

Version: 1.0

Document Type: Software Design Specification

Reference Standards:

* IEEE 1016 Software Design Description
* IEEE 29148
* Enterprise Architecture Best Practices

---

# 1. Purpose

เอกสาร SDS ฉบับนี้กำหนดรายละเอียดเชิงเทคนิคสำหรับการพัฒนาระบบ Chuenjai AI Care Platform โดยอ้างอิงจาก SRS เพื่อให้ทีมพัฒนา, QA, DevOps และผู้ดูแลระบบสามารถนำไปใช้งานได้จริง

---

# 2. System Overview

## Architecture Style

Hybrid Modular Monolith

Phase 1

```text
Frontend (Next.js)

↓

REST API (Node.js)

↓

MySQL

↓

External Services
```

รองรับการแยกเป็น Microservices ในอนาคต

---

# 3. Technology Stack

## Frontend

Framework

* Next.js 15 App Router
* TypeScript

UI

* Tailwind CSS
* Shadcn UI

AI

* Vercel AI SDK

Authentication

* JWT

Hosting

* Vercel

---

## Backend

Runtime

* Node.js 22

Framework

* Express.js

Validation

* Zod

ORM

* Prisma ORM

Authentication

* JWT
* Refresh Token

Queue

* BullMQ

Cache

* Redis

Hosting

* Atom Hosting VPS

Process Manager

* PM2

Reverse Proxy

* Nginx

---

## Database

MySQL 8

Character Set

utf8mb4

Collation

utf8mb4_unicode_ci

---

# 4. Project Structure

## Frontend

```text
src/

app/

(auth)
(dashboard)

components/

features/

elderlies/
users/
alerts/
reports/

services/

hooks/

stores/

types/

lib/
```

---

## Backend

```text
src/

controllers/

services/

repositories/

middlewares/

validators/

routes/

jobs/

queues/

integrations/

ai/

utils/

config/

prisma/
```

---

# 5. Module Design

## Module 1

Authentication

Responsibilities

* Login
* Logout
* Refresh Token
* Password Reset

Database

* users
* login_sessions

Endpoints

POST /auth/login

POST /auth/logout

POST /auth/refresh

POST /auth/reset-password

---

## Module 2

Organization Management

Responsibilities

* Tenant Management

Database

* organizations

Endpoints

GET /organizations

POST /organizations

PUT /organizations/:id

DELETE /organizations/:id

---

## Module 3

User Management

Responsibilities

* Create User
* Update User
* Disable User

Database

* users

Endpoints

GET /users

POST /users

PUT /users/:id

DELETE /users/:id

---

## Module 4

Elderly Management

Responsibilities

* CRUD Elderly
* Search
* Import Excel
* Export Excel

Database

* elderlies

Endpoints

GET /elderlies

GET /elderlies/:id

POST /elderlies

PUT /elderlies/:id

DELETE /elderlies/:id

POST /elderlies/import

GET /elderlies/export

---

## Module 5

Disease Management

Database

* diseases

Endpoints

GET /diseases

POST /diseases

PUT /diseases/:id

DELETE /diseases/:id

---

## Module 6

Medication Management

Database

* medications
* medication_logs

Endpoints

GET /medications

POST /medications

PUT /medications/:id

DELETE /medications/:id

GET /medication-logs

POST /medication-logs

---

## Module 7

Appointment Management

Database

* appointments
* appointment_reminders

Endpoints

GET /appointments

POST /appointments

PUT /appointments/:id

DELETE /appointments/:id

---

## Module 8

Care Plan Management

Database

* care_plans

Endpoints

GET /care-plans

POST /care-plans

PUT /care-plans/:id

DELETE /care-plans/:id

---

## Module 9

Voice AI

Database

* calls
* call_transcripts

Responsibilities

* Outbound Calling
* AI Conversation
* Transcript Storage

Endpoints

POST /voice/call

GET /calls

GET /calls/:id

GET /calls/:id/transcripts

---

## Module 10

Risk Engine

Database

* risk_scores

Responsibilities

* Risk Calculation
* Health Analysis

Endpoints

POST /risk/calculate

GET /risk-scores

GET /risk-scores/:elderlyId

---

## Module 11

Alert Center

Database

* alerts

Endpoints

GET /alerts

POST /alerts

PUT /alerts/:id

POST /alerts/:id/resolve

---

## Module 12

Notification Center

Database

* notifications

Channels

* LINE
* SMS
* Email
* Voice

Endpoints

POST /notifications/send

GET /notifications

---

## Module 13

Event Management

Database

* events

Endpoints

GET /events

POST /events

PUT /events/:id

DELETE /events/:id

---

## Module 14

Reporting

Database

* report_jobs

Endpoints

POST /reports/generate

GET /reports

GET /reports/:id/download

---

## Module 15

Dashboard

Responsibilities

* KPI
* Analytics
* Statistics

Endpoints

GET /dashboard/executive

GET /dashboard/operations

GET /dashboard/risk

---

# 6. RBAC Design

SUPER_ADMIN

All Access

---

ADMIN

Organization Access

---

SUPERVISOR

Team Management

---

OFFICER

Case Management

---

NURSE

Healthcare Data

---

VIEWER

Read Only

---

# 7. Sequence Design

## Login Flow

```text
User

↓

Frontend

↓

API

↓

MySQL

↓

JWT

↓

Frontend
```

---

## Voice AI Flow

```text
Scheduler

↓

BullMQ

↓

Voice Service

↓

STT

↓

OpenAI

↓

TTS

↓

Call

↓

Transcript

↓

Risk Engine

↓

Alert Engine
```

---

## Medication Reminder Flow

```text
Cron Job

↓

Medication Scheduler

↓

Notification Service

↓

LINE OA

↓

Elderly
```

---

## Appointment Reminder Flow

```text
Appointment

↓

Reminder Job

↓

LINE

↓

Voice AI

↓

Elderly
```

---

## Alert Flow

```text
Risk Engine

↓

Alert Created

↓

Notification Service

↓

Officer

↓

Caregiver

↓

Resolution
```

---

# 8. AI Design

## AI Components

AI-01

Conversation Analysis

---

AI-02

Risk Prediction

---

AI-03

Medication Compliance Analysis

---

AI-04

Appointment Compliance Analysis

---

AI-05

Mental Health Assessment

---

AI-06

Executive Summary Generator

---

# 9. Queue Design

Redis + BullMQ

Queues

voice-call-queue

notification-queue

risk-calculation-queue

report-generation-queue

integration-sync-queue

---

# 10. Cache Design

Redis

Cached Objects

dashboard

organization-settings

user-permissions

risk-summary

TTL

5 Minutes

---

# 11. Security Design

Authentication

JWT Access Token

15 Minutes

---

Refresh Token

30 Days

---

Password

bcrypt

Rounds

12

---

Rate Limiting

100 Requests / Minute

---

CSRF Protection

Enabled

---

CORS

Whitelist Only

---

# 12. Audit Design

Audit Events

Create

Update

Delete

Login

Logout

Export

Import

Report Download

---

Stored Fields

User

Timestamp

IP Address

Action

Old Data

New Data

---

# 13. Logging Design

Levels

INFO

WARN

ERROR

FATAL

---

Library

Winston

---

Storage

Database

File

External Monitoring

---

# 14. Error Handling

Format

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Citizen ID is required"
}
```

---

# 15. API Response Standard

Success

```json
{
  "success": true,
  "data": {}
}
```

Error

```json
{
  "success": false,
  "error": {}
}
```

---

# 16. Monitoring Design

Metrics

CPU

Memory

Queue Length

API Latency

Error Rate

Notification Failures

Voice Call Failures

---

# 17. Backup Design

Database

Daily Backup

---

Audio Recording

Daily Backup

---

Retention

30 Days

---

# 18. Future Architecture Evolution

Phase 2

Microservices

* Voice Service
* AI Service
* Notification Service
* Reporting Service

---

Phase 3

Kubernetes

Load Balancer

Multi Region

Disaster Recovery Site

---

# 19. Release Scope V1

Included

* Multi Tenant
* User Management
* Elderly Management
* Medication Management
* Appointment Management
* Voice AI
* Alert Center
* Risk Engine
* Dashboard
* Reporting
* Audit Trail

Excluded

* Mobile Application
* GIS Heat Map
* Smart Watch Integration
* Fall Detection
* FHIR Gateway

Included in Future Releases
