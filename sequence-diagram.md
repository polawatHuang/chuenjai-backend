Use Case Diagram (System Level)
Actors
Super Admin
Organization Admin
Supervisor
Officer
Nurse
Caregiver
Elderly

External Systems
LINE OA
Voice Gateway
OpenAI
Hospital System
UC-01 Login
User
 │
 ├─ Login
 ├─ Refresh Token
 └─ Logout
UC-02 Organization Management
Organization Admin

 ├─ Create Organization
 ├─ Update Organization
 ├─ Manage Subscription
 └─ Configure Settings
UC-03 User Management
Admin

 ├─ Create User
 ├─ Edit User
 ├─ Assign Role
 ├─ Reset Password
 └─ Disable User
UC-04 Elderly Management
Officer

 ├─ Create Elderly
 ├─ Update Elderly
 ├─ Search Elderly
 ├─ Import Excel
 ├─ Export Excel
 └─ View Profile
UC-05 Health Management
Officer / Nurse

 ├─ Add Disease
 ├─ Update Disease
 ├─ Add Medication
 ├─ Update Medication
 ├─ Create Care Plan
 └─ Update Care Plan
UC-06 Appointment Management
Officer

 ├─ Create Appointment
 ├─ Edit Appointment
 ├─ Cancel Appointment
 └─ Send Reminder
UC-07 Voice AI Calling
Scheduler

 ├─ Schedule Call
 ├─ Start Call
 ├─ AI Conversation
 ├─ Save Transcript
 ├─ Generate Summary
 └─ Generate Risk Score
UC-08 Alert Management
System

 ├─ Create Alert
 ├─ Assign Alert
 ├─ Escalate Alert
 └─ Resolve Alert
UC-09 Notification Management
System

 ├─ Send LINE
 ├─ Send SMS
 ├─ Send Email
 └─ Send Voice Reminder
UC-10 Reporting
Executive

 ├─ Daily Report
 ├─ Monthly Report
 ├─ PDF Export
 ├─ Excel Export
 └─ AI Summary Report
UC-11 Dashboard
Executive

 ├─ Executive Dashboard
 ├─ Risk Dashboard
 ├─ Alert Dashboard
 └─ GIS Dashboard
Sequence Diagram 01
Login
User
 │
 │ Login
 ▼

Frontend
 │
 │ POST /auth/login
 ▼

API
 │
 │ Validate User
 ▼

MySQL
 │
 │ User Data
 ▼

API
 │
 │ Generate JWT
 ▼

Frontend
 │
 │ Store Token
 ▼

Dashboard
Sequence Diagram 02
Create Elderly
Officer
 │
 ▼

Frontend

 │ Submit Form
 ▼

API

 │ Validate
 ▼

MySQL

 │ Insert Elderly
 ▼

API

 │ Audit Log
 ▼

Audit Table

 │ Success
 ▼

Frontend
Sequence Diagram 03
Import Excel
Officer

 ▼

Upload Excel

 ▼

API

 ▼

Validation Service

 ▼

Excel Parser

 ▼

MySQL

 ▼

Bulk Insert

 ▼

Audit Log

 ▼

Success
Sequence Diagram 04
Medication Reminder
Cron Job

 ▼

Medication Scheduler

 ▼

Query Medications

 ▼

MySQL

 ▼

Create Notification

 ▼

Notification Queue

 ▼

LINE Service

 ▼

LINE OA

 ▼

Elderly
Sequence Diagram 05
Appointment Reminder
Appointment Scheduler

 ▼

Find Tomorrow Appointments

 ▼

MySQL

 ▼

Notification Queue

 ▼

LINE OA

 ▼

Voice AI

 ▼

Elderly
Sequence Diagram 06
Voice AI Health Check
Scheduler

 ▼

Call Queue

 ▼

Voice Gateway

 ▼

Elderly

 ▼

Speech To Text

 ▼

OpenAI

 ▼

Generate Response

 ▼

Text To Speech

 ▼

Continue Conversation

 ▼

Save Transcript

 ▼

MySQL
Sequence Diagram 07
AI Transcript Analysis
Transcript

 ▼

AI Service

 ▼

OpenAI

 ▼

Summary

 ▼

Sentiment

 ▼

Risk Factors

 ▼

Save Analysis

 ▼

MySQL
Sequence Diagram 08
Risk Calculation
Nightly Job

 ▼

Fetch Diseases

 ▼

Fetch Medications

 ▼

Fetch Calls

 ▼

Fetch AI Summary

 ▼

Risk Engine

 ▼

Calculate Score

 ▼

Store Score

 ▼

risk_scores
Sequence Diagram 09
High Risk Alert
Risk Engine

 ▼

Risk > 80

 ▼

Create Alert

 ▼

alerts

 ▼

Notification Queue

 ▼

Officer

 ▼

Caregiver

 ▼

LINE Notification
Sequence Diagram 10
No Answer Alert
Voice AI

 ▼

Call Failed

 ▼

Retry 3 Times

 ▼

Still Failed

 ▼

Create Alert

 ▼

Officer
Sequence Diagram 11
Emergency Detection

ตัวอย่าง

ผู้สูงอายุพูดว่า

หายใจไม่ออก

ล้มในห้องน้ำ

เจ็บหน้าอกมาก

Voice AI

 ▼

Transcript

 ▼

OpenAI

 ▼

Emergency Classification

 ▼

Critical Alert

 ▼

Officer

 ▼

Caregiver

 ▼

Emergency Contact
Sequence Diagram 12
Alert Resolution
Officer

 ▼

Open Alert

 ▼

Investigate

 ▼

Visit Elderly

 ▼

Update Result

 ▼

Resolve Alert

 ▼

Audit Log
Sequence Diagram 13
Dashboard Load
Executive

 ▼

Dashboard

 ▼

API

 ▼

Redis Cache

 ▼

Miss

 ▼

MySQL

 ▼

Aggregate KPIs

 ▼

Cache Result

 ▼

Return Dashboard
Sequence Diagram 14
Generate PDF Report
Executive

 ▼

Generate Report

 ▼

Report Queue

 ▼

Worker

 ▼

Query Data

 ▼

AI Summary

 ▼

PDF Engine

 ▼

Object Storage

 ▼

Download URL
Sequence Diagram 15
LINE Broadcast Event
Officer

 ▼

Create Event

 ▼

Event Service

 ▼

Find Eligible Elderlies

 ▼

Notification Queue

 ▼

LINE OA

 ▼

Recipients
Sequence Diagram 16
Hospital Integration
Nightly Sync

 ▼

Integration Service

 ▼

HOSxP API

 ▼

Appointment Data

 ▼

Medication Data

 ▼

Mapping Layer

 ▼

MySQL
Sequence Diagram 17
User Permission Check
Officer

 ▼

Request API

 ▼

JWT Middleware

 ▼

RBAC Middleware

 ▼

Permission Check

 ▼

Allow / Deny
Sequence Diagram 18
Audit Logging
User Action

 ▼

API

 ▼

Business Logic

 ▼

Database Update

 ▼

Audit Service

 ▼

audit_logs
Sequence Diagram 19
Executive AI Summary
Monthly Report

 ▼

Analytics Engine

 ▼

Risk Statistics

 ▼

Call Statistics

 ▼

Alert Statistics

 ▼

OpenAI

 ▼

Executive Summary

 ▼

PDF Report
Sequence Diagram 20
End-to-End Core Flow (จุดขายหลัก)
เจ้าหน้าที่เพิ่มข้อมูลผู้สูงอายุ

 ▼

กำหนดยา

 ▼

กำหนดนัดหมอ

 ▼

AI โทรติดตาม

 ▼

วิเคราะห์บทสนทนา

 ▼

คำนวณความเสี่ยง

 ▼

แจ้งเตือนเจ้าหน้าที่

 ▼

แจ้งญาติผ่าน LINE

 ▼

ติดตามผล

 ▼

สร้างรายงานผู้บริหาร