# Software Requirements Specification (SRS)

# Chuenjai AI Care Platform

AI-Powered Elderly Care Management Platform

Version: 1.0

Document Type: Software Requirements Specification (SRS)

Standard: IEEE 29148 / IEEE 830 Inspired

---

# 1. Introduction

## 1.1 Purpose

เอกสารนี้จัดทำขึ้นเพื่อกำหนดความต้องการของระบบ Chuenjai AI Care Platform ซึ่งเป็นระบบบริหารจัดการผู้สูงอายุอัจฉริยะที่ใช้ AI ช่วยติดตามสุขภาพ วิเคราะห์ความเสี่ยง แจ้งเตือนเหตุผิดปกติ และสนับสนุนการทำงานของเจ้าหน้าที่ในองค์กรที่ดูแลผู้สูงอายุ

---

## 1.2 Scope

ระบบรองรับ

* เทศบาล
* องค์การบริหารส่วนตำบล
* โรงพยาบาล
* ศูนย์ดูแลผู้สูงอายุ
* องค์กรเอกชนด้านสุขภาพ

ความสามารถหลัก

* จัดการข้อมูลผู้สูงอายุ
* AI Voice Calling
* Medication Management
* Appointment Management
* Risk Analysis
* Alert Management
* Reporting & Analytics
* Multi-Tenant SaaS

---

## 1.3 Definitions

| Term       | Description          |
| ---------- | -------------------- |
| Elderly    | ผู้สูงอายุ           |
| Caregiver  | ผู้ดูแล              |
| Officer    | เจ้าหน้าที่          |
| Tenant     | องค์กรผู้ใช้งาน      |
| Risk Score | คะแนนความเสี่ยง      |
| Alert      | การแจ้งเตือน         |
| Voice AI   | AI โทรศัพท์อัตโนมัติ |

---

# 2. Overall Description

## 2.1 Product Perspective

ระบบเป็น Web-Based SaaS

Architecture

Frontend

* Next.js
* Vercel

Backend

* Node.js
* REST API

Database

* MySQL

AI

* OpenAI

Communication

* LINE OA
* Voice Gateway

---

## 2.2 User Classes

### Super Admin

ดูแลระบบทั้งหมด

---

### Organization Admin

ดูแลองค์กรของตนเอง

---

### Supervisor

บริหารทีมดูแลผู้สูงอายุ

---

### Officer

ติดตามและดูแลผู้สูงอายุ

---

### Nurse

ติดตามข้อมูลสุขภาพ

---

### Caregiver

รับการแจ้งเตือน

---

### Executive

ดู Dashboard และรายงาน

---

# 3. Functional Requirements

# FR-01 Authentication

## FR-01-001

ระบบต้องรองรับการ Login

Priority: High

---

## FR-01-002

ระบบต้องรองรับ JWT Authentication

Priority: High

---

## FR-01-003

ระบบต้องรองรับ Refresh Token

Priority: High

---

## FR-01-004

ระบบต้องรองรับ Multi-Factor Authentication

Priority: Medium

---

# FR-02 Organization Management

## FR-02-001

สร้างองค์กรใหม่ได้

---

## FR-02-002

แก้ไขข้อมูลองค์กรได้

---

## FR-02-003

ปิดการใช้งานองค์กรได้

---

## FR-02-004

กำหนด Subscription Plan ได้

---

# FR-03 User Management

## FR-03-001

สร้างผู้ใช้งานได้

---

## FR-03-002

แก้ไขข้อมูลผู้ใช้งานได้

---

## FR-03-003

กำหนด Role ได้

---

## FR-03-004

Reset Password ได้

---

## FR-03-005

Disable User ได้

---

# FR-04 Elderly Management

## FR-04-001

สร้างข้อมูลผู้สูงอายุได้

---

## FR-04-002

แก้ไขข้อมูลผู้สูงอายุได้

---

## FR-04-003

ลบข้อมูลผู้สูงอายุได้

---

## FR-04-004

ค้นหาผู้สูงอายุได้

---

## FR-04-005

นำเข้าข้อมูลผ่าน Excel ได้

---

## FR-04-006

ส่งออกข้อมูล Excel ได้

---

## FR-04-007

รองรับการจัดเก็บพิกัด GIS

---

# FR-05 Disease Management

## FR-05-001

บันทึกโรคประจำตัวได้

---

## FR-05-002

แก้ไขโรคประจำตัวได้

---

## FR-05-003

เก็บประวัติโรคย้อนหลังได้

---

# FR-06 Medication Management

## FR-06-001

เพิ่มรายการยาได้

---

## FR-06-002

กำหนดเวลาเตือนยาได้

---

## FR-06-003

แก้ไขรายการยาได้

---

## FR-06-004

ยกเลิกรายการยาได้

---

## FR-06-005

ติดตามการกินยาได้

---

# FR-07 Appointment Management

## FR-07-001

สร้างนัดหมายแพทย์ได้

---

## FR-07-002

แก้ไขนัดหมายได้

---

## FR-07-003

ยกเลิกนัดหมายได้

---

## FR-07-004

แจ้งเตือนก่อนนัดหมายได้

---

# FR-08 Care Plan Management

## FR-08-001

สร้างแผนการดูแลรายบุคคลได้

---

## FR-08-002

กำหนดเจ้าหน้าที่รับผิดชอบได้

---

## FR-08-003

ติดตามสถานะแผนการดูแลได้

---

# FR-09 Voice AI Calling

## FR-09-001

โทรหาผู้สูงอายุอัตโนมัติได้

---

## FR-09-002

รองรับภาษาไทย

---

## FR-09-003

บันทึกบทสนทนาได้

---

## FR-09-004

วิเคราะห์บทสนทนาได้

---

## FR-09-005

สร้าง Transcript ได้

---

## FR-09-006

สร้าง Summary ได้

---

# FR-10 AI Analytics

## FR-10-001

คำนวณ Risk Score ได้

---

## FR-10-002

วิเคราะห์แนวโน้มสุขภาพได้

---

## FR-10-003

วิเคราะห์การขาดยาได้

---

## FR-10-004

วิเคราะห์ความเสี่ยงการเข้ารักษาในโรงพยาบาลได้

---

## FR-10-005

วิเคราะห์ความโดดเดี่ยวทางสังคมได้

---

# FR-11 Alert Center

## FR-11-001

สร้าง Alert อัตโนมัติได้

---

## FR-11-002

จัดระดับความรุนแรงได้

Levels

* Low
* Medium
* High
* Critical

---

## FR-11-003

Assign Alert ได้

---

## FR-11-004

ปิด Alert ได้

---

## FR-11-005

เก็บประวัติ Alert ได้

---

# FR-12 Notification

## FR-12-001

ส่ง LINE Notification ได้

---

## FR-12-002

ส่ง SMS ได้

---

## FR-12-003

ส่ง Email ได้

---

## FR-12-004

ส่ง Voice Reminder ได้

---

# FR-13 Event Management

## FR-13-001

สร้างกิจกรรมชุมชนได้

---

## FR-13-002

แจ้งผู้เข้าร่วมได้

---

## FR-13-003

ติดตามผู้ตอบรับได้

---

# FR-14 Dashboard

## FR-14-001

แสดงจำนวนผู้สูงอายุทั้งหมด

---

## FR-14-002

แสดง Risk Distribution

---

## FR-14-003

แสดง Open Alerts

---

## FR-14-004

แสดง Call Statistics

---

## FR-14-005

แสดง GIS Map

---

# FR-15 Reporting

## FR-15-001

สร้างรายงานรายวัน

---

## FR-15-002

สร้างรายงานรายสัปดาห์

---

## FR-15-003

สร้างรายงานรายเดือน

---

## FR-15-004

Export PDF

---

## FR-15-005

Export Excel

---

## FR-15-006

AI Executive Summary

---

# FR-16 Audit Logging

## FR-16-001

เก็บประวัติการใช้งานทุก Transaction

---

## FR-16-002

ตรวจสอบย้อนหลังได้

---

## FR-16-003

Export Audit Logs ได้

---

# 4. Non-Functional Requirements

## NFR-01 Availability

System Availability

99.5%

---

## NFR-02 Performance

Response Time

< 2 Seconds

95% ของ Requests

---

## NFR-03 Scalability

รองรับ

100,000+ ผู้สูงอายุ

---

## NFR-04 Security

OWASP Top 10 Compliance

---

## NFR-05 Authentication

JWT + Refresh Token

---

## NFR-06 Encryption

Password

bcrypt

Sensitive Data

AES-256

---

## NFR-07 Auditability

ทุกการแก้ไขต้องมี Audit Trail

---

## NFR-08 Backup

Database Backup Daily

Retention 30 Days

---

## NFR-09 Localization

รองรับภาษาไทย

---

## NFR-10 Browser Support

Chrome

Edge

Safari

Firefox

---

# 5. External Interfaces

## OpenAI API

Voice AI

Risk Analysis

AI Summary

---

## LINE Messaging API

Notifications

Reminders

Alerts

---

## Voice Gateway

Outbound Calls

Inbound Calls

---

## HOSxP Integration

Patient Data

Appointments

Medications

---

## JHCIS Integration

Community Health Data

---

# 6. Acceptance Criteria

ระบบจะถือว่าส่งมอบสำเร็จเมื่อ

1. ผู้ใช้งาน Login ได้
2. จัดการข้อมูลผู้สูงอายุได้
3. นำเข้าข้อมูล Excel ได้
4. Voice AI โทรออกได้
5. AI วิเคราะห์บทสนทนาได้
6. Risk Score ทำงานได้
7. Alert Center ทำงานได้
8. LINE Notification ทำงานได้
9. Dashboard แสดงผลได้
10. รายงาน PDF และ Excel สร้างได้
11. Audit Log ทำงานได้
12. Multi-Tenant Isolation ผ่านการทดสอบ
13. Security Testing ผ่าน
14. UAT ผ่านตามเกณฑ์ที่กำหนด
