ความสัมพันธ์ของตาราง
users
 │
 ├── audit_logs
 │
 └── alerts

elderlies
 │
 ├── diseases
 ├── medications
 ├── appointments
 ├── calls
 ├── alerts
 ├── risk_scores
 └── notifications

calls
 │
 └── call_transcripts

alerts
 │
 └── notifications

events
 │
 └── notifications

 organizations
    │
    ├── users
    ├── elderlies
    ├── events
    ├── system_settings
    ├── care_plans
    │
    └── reports

elderlies
    │
    ├── diseases
    ├── medications
    ├── medication_logs
    ├── appointments
    ├── appointment_reminders
    ├── caregivers
    ├── emergency_contacts
    ├── risk_scores
    ├── calls
    ├── ai_conversations
    ├── alerts
    └── notifications


1. users

เจ้าหน้าที่ใช้งานระบบ

CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    organization_id BIGINT NOT NULL,

    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,

    full_name VARCHAR(255) NOT NULL,

    email VARCHAR(255),
    phone VARCHAR(50),

    role ENUM(
        'SUPER_ADMIN',
        'ADMIN',
        'SUPERVISOR',
        'OFFICER',
        'NURSE',
        'VIEWER'
    ) NOT NULL,

    is_active BOOLEAN DEFAULT TRUE,

    last_login_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
2. elderlies

ข้อมูลผู้สูงอายุ

CREATE TABLE elderlies (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    organization_id BIGINT NOT NULL,

    citizen_id VARCHAR(20) UNIQUE,

    first_name VARCHAR(255),
    last_name VARCHAR(255),

    gender ENUM(
        'MALE',
        'FEMALE',
        'OTHER'
    ),

    birth_date DATE,

    age INT,

    phone VARCHAR(50),

    line_user_id VARCHAR(255),

    address TEXT,

    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),

    blood_type VARCHAR(5),

    weight DECIMAL(5,2),
    height DECIMAL(5,2),

    status ENUM(
        'ACTIVE',
        'INACTIVE',
        'DECEASED'
    ) DEFAULT 'ACTIVE',

    caregiver_name VARCHAR(255),
    caregiver_phone VARCHAR(50),

    created_by BIGINT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
3. diseases

โรคประจำตัว

1 คนหลายโรค

CREATE TABLE diseases (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    elderly_id BIGINT NOT NULL,

    disease_code VARCHAR(50),

    disease_name VARCHAR(255),

    diagnosed_date DATE,

    severity ENUM(
        'LOW',
        'MEDIUM',
        'HIGH'
    ),

    notes TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
4. medications

รายการยา

CREATE TABLE medications (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    elderly_id BIGINT NOT NULL,

    medication_name VARCHAR(255),

    dosage VARCHAR(100),

    frequency VARCHAR(100),

    schedule_time TIME,

    start_date DATE,
    end_date DATE,

    prescribing_hospital VARCHAR(255),

    is_active BOOLEAN DEFAULT TRUE,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
5. appointments

นัดหมายแพทย์

CREATE TABLE appointments (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    elderly_id BIGINT NOT NULL,

    hospital_name VARCHAR(255),

    department VARCHAR(255),

    doctor_name VARCHAR(255),

    appointment_datetime DATETIME,

    purpose TEXT,

    status ENUM(
        'SCHEDULED',
        'COMPLETED',
        'CANCELLED',
        'MISSED'
    ),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
6. calls

ประวัติการโทร

CREATE TABLE calls (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    elderly_id BIGINT NOT NULL,

    phone_number VARCHAR(50),

    call_type ENUM(
        'MEDICATION',
        'HEALTH_CHECK',
        'APPOINTMENT',
        'EMERGENCY'
    ),

    call_status ENUM(
        'SUCCESS',
        'FAILED',
        'NO_ANSWER',
        'BUSY'
    ),

    duration_seconds INT,

    recording_url TEXT,

    started_at DATETIME,
    ended_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
7. call_transcripts

บทสนทนา AI

CREATE TABLE call_transcripts (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    call_id BIGINT NOT NULL,

    speaker ENUM(
        'AI',
        'ELDERLY'
    ),

    transcript TEXT,

    confidence_score DECIMAL(5,2),

    sentiment_score DECIMAL(5,2),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
8. alerts

ศูนย์แจ้งเตือน

CREATE TABLE alerts (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    elderly_id BIGINT NOT NULL,

    alert_type ENUM(
        'MEDICATION',
        'HEALTH',
        'APPOINTMENT',
        'EMERGENCY',
        'NO_ANSWER'
    ),

    severity ENUM(
        'LOW',
        'MEDIUM',
        'HIGH',
        'CRITICAL'
    ),

    title VARCHAR(255),

    description TEXT,

    status ENUM(
        'OPEN',
        'IN_PROGRESS',
        'RESOLVED',
        'CLOSED'
    ),

    assigned_user_id BIGINT,

    resolved_by BIGINT,

    resolved_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
9. risk_scores

คะแนนความเสี่ยง

CREATE TABLE risk_scores (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    elderly_id BIGINT NOT NULL,

    score DECIMAL(5,2),

    risk_level ENUM(
        'LOW',
        'MEDIUM',
        'HIGH',
        'CRITICAL'
    ),

    factors JSON,

    ai_summary TEXT,

    calculated_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ตัวอย่าง factors

{
  "missed_calls": 3,
  "dizziness": true,
  "diabetes": true,
  "living_alone": true
}
10. events

กิจกรรมชุมชน

CREATE TABLE events (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    organization_id BIGINT NOT NULL,

    event_name VARCHAR(255),

    description TEXT,

    location VARCHAR(255),

    start_datetime DATETIME,
    end_datetime DATETIME,

    max_participants INT,

    created_by BIGINT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
11. notifications

แจ้งเตือนทุกช่องทาง

CREATE TABLE notifications (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    elderly_id BIGINT,

    alert_id BIGINT,

    channel ENUM(
        'LINE',
        'SMS',
        'EMAIL',
        'VOICE_CALL'
    ),

    recipient VARCHAR(255),

    subject VARCHAR(255),

    message TEXT,

    delivery_status ENUM(
        'PENDING',
        'SENT',
        'FAILED',
        'READ'
    ),

    sent_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
12. audit_logs

ระบบตรวจสอบย้อนหลัง

สำคัญมากสำหรับหน่วยงานรัฐ

CREATE TABLE audit_logs (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    user_id BIGINT,

    action VARCHAR(255),

    table_name VARCHAR(255),

    record_id BIGINT,

    old_data JSON,

    new_data JSON,

    ip_address VARCHAR(100),

    user_agent TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

13. organizations

Tenant หลัก

1 องค์กร = 1 เทศบาล

CREATE TABLE organizations (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    code VARCHAR(50) UNIQUE,

    organization_name VARCHAR(255) NOT NULL,

    organization_type ENUM(
        'MUNICIPALITY',
        'HOSPITAL',
        'PRIVATE_CARE',
        'INSURANCE'
    ),

    tax_id VARCHAR(30),

    phone VARCHAR(50),
    email VARCHAR(255),

    address TEXT,

    province VARCHAR(255),
    district VARCHAR(255),

    logo_url TEXT,

    subscription_plan ENUM(
        'BASIC',
        'PRO',
        'ENTERPRISE'
    ),

    subscription_start DATE,
    subscription_end DATE,

    is_active BOOLEAN DEFAULT TRUE,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
14. caregivers

ผู้ดูแล

1 ผู้สูงอายุอาจมีหลายผู้ดูแล

CREATE TABLE caregivers (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    elderly_id BIGINT NOT NULL,

    full_name VARCHAR(255),

    relationship VARCHAR(100),

    phone VARCHAR(50),

    line_user_id VARCHAR(255),

    email VARCHAR(255),

    is_primary BOOLEAN DEFAULT FALSE,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
15. emergency_contacts

เบอร์ฉุกเฉิน

CREATE TABLE emergency_contacts (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    elderly_id BIGINT NOT NULL,

    contact_name VARCHAR(255),

    relationship VARCHAR(100),

    phone VARCHAR(50),

    priority_order INT DEFAULT 1,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
16. care_plans

แผนดูแลรายบุคคล

สำคัญมากสำหรับโรงพยาบาล

CREATE TABLE care_plans (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    elderly_id BIGINT NOT NULL,

    plan_name VARCHAR(255),

    description TEXT,

    objectives TEXT,

    start_date DATE,

    end_date DATE,

    status ENUM(
        'ACTIVE',
        'COMPLETED',
        'CANCELLED'
    ),

    assigned_user_id BIGINT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
17. medication_logs

เก็บการกินยา

CREATE TABLE medication_logs (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    medication_id BIGINT NOT NULL,

    elderly_id BIGINT NOT NULL,

    scheduled_time DATETIME,

    taken_time DATETIME,

    status ENUM(
        'TAKEN',
        'MISSED',
        'SKIPPED'
    ),

    source ENUM(
        'LINE',
        'VOICE_AI',
        'OFFICER',
        'MOBILE_APP'
    ),

    notes TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
18. appointment_reminders

ประวัติเตือนนัด

CREATE TABLE appointment_reminders (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    appointment_id BIGINT NOT NULL,

    reminder_datetime DATETIME,

    channel ENUM(
        'LINE',
        'VOICE_CALL',
        'SMS'
    ),

    status ENUM(
        'PENDING',
        'SENT',
        'FAILED'
    ),

    sent_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
19. ai_conversations

Memory ของ AI

ใช้วิเคราะห์ Long-term

CREATE TABLE ai_conversations (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    elderly_id BIGINT NOT NULL,

    call_id BIGINT,

    conversation_type ENUM(
        'HEALTH_CHECK',
        'MEDICATION',
        'EMERGENCY',
        'SOCIAL'
    ),

    summary TEXT,

    sentiment_score DECIMAL(5,2),

    loneliness_score DECIMAL(5,2),

    depression_score DECIMAL(5,2),

    risk_score DECIMAL(5,2),

    ai_recommendation TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
20. system_settings

Config ของแต่ละ Tenant

CREATE TABLE system_settings (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    organization_id BIGINT NOT NULL,

    setting_key VARCHAR(255),

    setting_value JSON,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ตัวอย่าง

{
  "voice_call_start": "07:00",
  "voice_call_end": "18:00",
  "risk_threshold": 70,
  "line_notification": true
}
21. report_jobs

รองรับ Reporting ขนาดใหญ่

CREATE TABLE report_jobs (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    organization_id BIGINT NOT NULL,

    report_type VARCHAR(100),

    parameters JSON,

    status ENUM(
        'PENDING',
        'PROCESSING',
        'COMPLETED',
        'FAILED'
    ),

    file_url TEXT,

    generated_by BIGINT,

    generated_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
22. integrations

เชื่อม HOSxP / JHCIS

CREATE TABLE integrations (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    organization_id BIGINT NOT NULL,

    integration_type ENUM(
        'HOSXP',
        'JHCIS',
        'FHIR',
        'LINE',
        'SMS'
    ),

    configuration JSON,

    is_active BOOLEAN DEFAULT TRUE,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
23. integration_logs

Audit Integration

CREATE TABLE integration_logs (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    integration_id BIGINT,

    request_payload JSON,

    response_payload JSON,

    status ENUM(
        'SUCCESS',
        'FAILED'
    ),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
24. role_permissions

RBAC ระดับ Enterprise

CREATE TABLE role_permissions (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    role_name VARCHAR(100),

    module_name VARCHAR(100),

    can_view BOOLEAN,
    can_create BOOLEAN,
    can_update BOOLEAN,
    can_delete BOOLEAN
);
25. login_sessions

Session Tracking

CREATE TABLE login_sessions (

    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    user_id BIGINT,

    refresh_token TEXT,

    ip_address VARCHAR(100),

    user_agent TEXT,

    expires_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
สรุป Enterprise Schema V1

รวมประมาณ 25 ตารางหลัก

Core
organizations
users
elderlies
caregivers
emergency_contacts
Healthcare
diseases
medications
medication_logs
appointments
appointment_reminders
care_plans
AI
calls
call_transcripts
ai_conversations
risk_scores
Operations
alerts
notifications
events
Enterprise
audit_logs
report_jobs
integrations
integration_logs
role_permissions
login_sessions
system_settings