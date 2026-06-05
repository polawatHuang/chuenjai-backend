# Architecture Design Document (ADD)

## Project Name

น้องชื่นใจ AI Care Platform

## Version

1.0

## Document Type

Software Architecture Design Document

## Objective

พัฒนาระบบ AI Elderly Care Platform สำหรับติดตาม ดูแล และเฝ้าระวังผู้สูงอายุแบบอัตโนมัติ รองรับการใช้งานหลายหน่วยงาน (Multi-Tenant SaaS)

กลุ่มเป้าหมาย

* เทศบาล
* อบต.
* โรงพยาบาล
* ศูนย์ดูแลผู้สูงอายุ
* บริษัทประกันสุขภาพ

---

# 1. Architecture Principles

## AP-01 Multi-Tenant First

ทุกข้อมูลต้องถูกแยกตาม Organization

รองรับ

* 1 เทศบาล
* 100 เทศบาล
* หลายโรงพยาบาล

ภายในระบบเดียว

---

## AP-02 API First

Frontend ทุกส่วนเรียกผ่าน REST API

ไม่มีการเชื่อมต่อฐานข้อมูลโดยตรง

---

## AP-03 Security by Design

* JWT Authentication
* RBAC Authorization
* Audit Trail
* Data Encryption
* HTTPS Only

---

## AP-04 AI Native

AI เป็นส่วนหนึ่งของระบบหลัก

* Voice AI
* Risk Scoring
* AI Summary
* AI Analytics

---

# 2. System Context Diagram

External Actors

1. Elderly
2. Caregiver
3. Municipal Officer
4. Hospital Staff
5. Administrator
6. Executive

External Systems

1. OpenAI
2. LINE OA
3. SMS Gateway
4. Voice Gateway
5. HOSxP
6. JHCIS

System Boundary

Chuenjai AI Care Platform

Responsibilities

* Elderly Management
* AI Calling
* Analytics
* Alerts
* Reporting

---

# 3. Logical Architecture

Presentation Layer

* Next.js
* Tailwind
* Shadcn UI
* Vercel AI SDK

Business Layer

* Node.js
* Express.js
* Service Layer
* Risk Engine
* Alert Engine

Data Layer

* MySQL
* Redis
* Object Storage

Integration Layer

* OpenAI API
* LINE Messaging API
* Twilio/SIP
* HOSxP API

---

# 4. C4 Container Architecture

Container 1

Frontend Portal

Technology

Next.js

Responsibilities

* Dashboard
* Administration
* Reporting

---

Container 2

REST API

Technology

Node.js Express

Responsibilities

* Authentication
* Business Logic
* Data Access

---

Container 3

Background Worker

Technology

Node.js + BullMQ

Responsibilities

* Voice Calls
* Notifications
* Report Generation
* Risk Calculation

---

Container 4

AI Service

Responsibilities

* Conversation Analysis
* Risk Prediction
* Summary Generation

---

Container 5

MySQL

Responsibilities

* Transactional Data

---

Container 6

Redis

Responsibilities

* Queue
* Cache
* Session

---

# 5. Deployment Architecture

Frontend

Vercel

Environment

Production

---

Backend

Atom Hosting VPS

Node.js

PM2

Nginx Reverse Proxy

---

Database

MySQL 8

Separate Database Server

---

Redis

Queue Server

---

Storage

Object Storage

Audio Recordings

Reports

Attachments

---

# 6. Security Architecture

Authentication

JWT Access Token

Expiration

15 Minutes

---

Refresh Token

Expiration

30 Days

---

Authorization

RBAC

Roles

SUPER_ADMIN

ADMIN

SUPERVISOR

OFFICER

NURSE

VIEWER

---

Encryption

Password

bcrypt

Sensitive Data

AES-256

Transport

TLS 1.3

---

# 7. AI Architecture

Voice AI Workflow

Scheduler

↓

Call Queue

↓

Voice Gateway

↓

Speech To Text

↓

OpenAI

↓

Text To Speech

↓

Phone Call

↓

Transcript Storage

↓

Risk Analysis

↓

Alert Generation

---

AI Modules

AI-01 Health Monitoring

AI-02 Medication Reminder

AI-03 Appointment Reminder

AI-04 Mental Health Assessment

AI-05 Risk Prediction

AI-06 Executive Summary

---

# 8. Risk Engine Architecture

Inputs

* Diseases
* Medications
* Missed Medication
* Appointments
* Call Results
* AI Sentiment

Processing

Rule Engine

*

AI Analysis

Outputs

* Risk Score
* Risk Level
* Alert

Risk Levels

LOW

MEDIUM

HIGH

CRITICAL

---

# 9. Alert Center Architecture

Alert Sources

* Medication Missed
* Appointment Missed
* Emergency Keywords
* No Answer
* High Risk Score

Workflow

Alert Created

↓

Assign Officer

↓

Notify Caregiver

↓

Escalation

↓

Resolution

↓

Audit Log

---

# 10. Reporting Architecture

Report Types

Daily Report

Weekly Report

Monthly Report

Executive Report

Government Report

---

Output Formats

PDF

Excel

CSV

---

AI Summary

Generated Automatically

---

# 11. Scalability Strategy

Level 1

1,000 Elderlies

Single Server

---

Level 2

10,000 Elderlies

Separate Worker

Separate Redis

---

Level 3

100,000 Elderlies

Load Balancer

Multiple API Servers

Read Replica Database

---

# 12. Monitoring

Application

PM2

---

Infrastructure

Uptime Monitoring

---

Logs

Winston

Audit Logs

System Logs

Error Logs

---

# 13. Backup Strategy

Database Backup

Daily

Retention

30 Days

---

Recording Backup

Daily

Retention

90 Days

---

Disaster Recovery

Recovery Time Objective

4 Hours

Recovery Point Objective

24 Hours

---

# 14. Non-Functional Requirements

Availability

99.5%

---

Response Time

< 2 Seconds

---

Concurrent Users

500+

---

Security

OWASP Top 10 Compliance

---

Auditability

100% Audit Trail

---

# 15. Future Roadmap

Phase 2

GIS Dashboard

Family Portal

Mobile App

Smart Watch Integration

Fall Detection

---

Phase 3

Predictive Healthcare

Digital Twin Elderly

Hospital Integration Hub

National Elderly Data Exchange
