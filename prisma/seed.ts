import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaMariaDb({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '3306', 10),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || process.env.DB_DATABASE || 'chuenjai',
  charset:  'utf8mb4',
});

const prisma = new PrismaClient({ adapter } as any);

// ============================================================
// RBAC Permission Matrix
// Each entry: [role, module, view, create, update, delete]
// ============================================================

type PermissionRow = [string, string, boolean, boolean, boolean, boolean];

const MODULES = [
  'organizations',
  'users',
  'elderlies',
  'diseases',
  'medications',
  'appointments',
  'calls',
  'alerts',
  'notifications',
  'events',
  'reports',
  'audit_logs',
  'system_settings',
  'care_plans',
  'integrations',
  'dashboard',
];

const PERMISSION_MATRIX: Record<string, [boolean, boolean, boolean, boolean]> = {
  // [view, create, update, delete]
  SUPER_ADMIN: [true, true, true, true],
  ADMIN:       [true, true, true, true],
  SUPERVISOR:  [true, true, true, false],
  OFFICER:     [true, true, true, false],
  NURSE:       [true, true, true, false],
  VIEWER:      [true, false, false, false],
};

// Restricted modules: OFFICER & NURSE cannot manage these
const RESTRICTED_FROM_OFFICER = new Set([
  'organizations',
  'users',
  'audit_logs',
  'system_settings',
  'integrations',
  'reports',
]);

// Modules NURSE focuses on (healthcare-specific)
const NURSE_MODULES = new Set([
  'elderlies',
  'diseases',
  'medications',
  'appointments',
  'care_plans',
  'alerts',
  'notifications',
  'calls',
  'dashboard',
]);

function buildPermissions(): PermissionRow[] {
  const rows: PermissionRow[] = [];

  for (const module of MODULES) {
    for (const [role, [view, create, update, del]] of Object.entries(PERMISSION_MATRIX)) {
      let effectiveView   = view;
      let effectiveCreate = create;
      let effectiveUpdate = update;
      let effectiveDelete = del;

      if (role === 'OFFICER' && RESTRICTED_FROM_OFFICER.has(module)) {
        effectiveView = false;
        effectiveCreate = false;
        effectiveUpdate = false;
        effectiveDelete = false;
      }

      if (role === 'NURSE') {
        if (!NURSE_MODULES.has(module)) {
          effectiveView = false;
          effectiveCreate = false;
          effectiveUpdate = false;
          effectiveDelete = false;
        } else if (RESTRICTED_FROM_OFFICER.has(module)) {
          effectiveCreate = false;
          effectiveUpdate = false;
          effectiveDelete = false;
        }
      }

      // VIEWER always read-only
      if (role === 'VIEWER') {
        effectiveCreate = false;
        effectiveUpdate = false;
        effectiveDelete = false;
      }

      rows.push([role, module, effectiveView, effectiveCreate, effectiveUpdate, effectiveDelete]);
    }
  }

  return rows;
}

// ============================================================
// Default System Settings per organization
// ============================================================

function buildSystemSettings(organizationId: bigint) {
  return [
    {
      organizationId,
      settingKey: 'voice_call_schedule',
      settingValue: { start: '08:00', end: '17:00', timezone: 'Asia/Bangkok' },
    },
    {
      organizationId,
      settingKey: 'risk_thresholds',
      settingValue: { low: 30, medium: 60, high: 80, critical: 90 },
    },
    {
      organizationId,
      settingKey: 'notification_channels',
      settingValue: { line: true, sms: false, email: true, voice_call: true },
    },
    {
      organizationId,
      settingKey: 'ai_call_frequency',
      settingValue: { medication_reminder_days: [1, 2, 3, 4, 5, 6, 7], health_check_interval_days: 3 },
    },
    {
      organizationId,
      settingKey: 'alert_auto_assign',
      settingValue: { enabled: false, default_assignee_role: 'OFFICER' },
    },
  ];
}

// ============================================================
// Main Seed
// ============================================================

async function main() {
  console.log('🌱 Starting database seed...\n');

  // ----------------------------------------------------------
  // 1. Default Organization (Platform HQ / Demo Tenant)
  // ----------------------------------------------------------
  console.log('📌 Seeding default organization...');

  const organization = await prisma.organization.upsert({
    where: { code: 'HQ-DEMO' },
    update: {},
    create: {
      code: 'HQ-DEMO',
      organizationName: 'Chuenjai AI Care Platform (Demo)',
      organizationType: 'MUNICIPALITY',
      province: 'กรุงเทพมหานคร',
      district: 'เขตพระนคร',
      subscriptionPlan: 'ENTERPRISE',
      subscriptionStart: new Date('2025-01-01'),
      subscriptionEnd: new Date('2026-12-31'),
      isActive: true,
    },
  });

  console.log(`   ✅ Organization: "${organization.organizationName}" (id: ${organization.id})\n`);

  // ----------------------------------------------------------
  // 2. Super Admin Account
  // ----------------------------------------------------------
  console.log('👤 Seeding Super Admin user...');

  const rawPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@1234!';
  const passwordHash = await bcrypt.hash(rawPassword, 12);

  const superAdmin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: { passwordHash },
    create: {
      organizationId: organization.id,
      username: 'superadmin',
      passwordHash,
      fullName: 'Super Administrator',
      email: 'superadmin@chuenjai.com',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  console.log(`   ✅ User: "${superAdmin.username}" (role: ${superAdmin.role}, id: ${superAdmin.id})\n`);

  // ----------------------------------------------------------
  // 3. Demo Staff Accounts (one per role for testing)
  // ----------------------------------------------------------
  console.log('👥 Seeding demo staff accounts...');

  const demoStaff = [
    { username: 'admin_demo',      fullName: 'Admin Demo',      role: 'ADMIN'      as const },
    { username: 'supervisor_demo', fullName: 'Supervisor Demo', role: 'SUPERVISOR' as const },
    { username: 'officer_demo',    fullName: 'Officer Demo',    role: 'OFFICER'    as const },
    { username: 'nurse_demo',      fullName: 'Nurse Demo',      role: 'NURSE'      as const },
    { username: 'viewer_demo',     fullName: 'Viewer Demo',     role: 'VIEWER'     as const },
  ];

  const demoPassword = await bcrypt.hash('Demo@1234!', 12);

  for (const staff of demoStaff) {
    await prisma.user.upsert({
      where: { username: staff.username },
      update: {},
      create: {
        organizationId: organization.id,
        username: staff.username,
        passwordHash: demoPassword,
        fullName: staff.fullName,
        email: `${staff.username}@chuenjai.com`,
        role: staff.role,
        isActive: true,
      },
    });
    console.log(`   ✅ ${staff.role}: ${staff.username}`);
  }

  console.log();

  // ----------------------------------------------------------
  // 4. Role Permissions Matrix
  // ----------------------------------------------------------
  console.log('🔐 Seeding role permissions...');

  const permissions = buildPermissions();

  await prisma.rolePermission.deleteMany({});

  await prisma.rolePermission.createMany({
    data: permissions.map(([roleName, moduleName, canView, canCreate, canUpdate, canDelete]) => ({
      roleName,
      moduleName,
      canView,
      canCreate,
      canUpdate,
      canDelete,
    })),
    skipDuplicates: true,
  });

  console.log(`   ✅ Inserted ${permissions.length} permission rows (${Object.keys(PERMISSION_MATRIX).length} roles × ${MODULES.length} modules)\n`);

  // ----------------------------------------------------------
  // 5. Default System Settings
  // ----------------------------------------------------------
  console.log('⚙️  Seeding system settings...');

  const settings = buildSystemSettings(organization.id);

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: {
        organizationId_settingKey: {
          organizationId: setting.organizationId,
          settingKey: setting.settingKey,
        },
      },
      update: { settingValue: setting.settingValue },
      create: setting,
    });
    console.log(`   ✅ ${setting.settingKey}`);
  }

  console.log();

  // ----------------------------------------------------------
  // 6. Demo Elderly Profiles (10 people)
  // ----------------------------------------------------------
  console.log('👴 Seeding demo elderly profiles...');

  function daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  }

  const ELDERLY_SEED = [
    {
      citizenId: '3100112345678',
      firstName: 'สมชาย', lastName: 'ใจดี',
      gender: 'MALE' as const, birthDate: new Date('1947-03-15'), age: 78,
      phone: '0812345671', bloodType: 'O+',
      weight: 68.5, height: 165.0, status: 'ACTIVE' as const,
      address: '123 ถนนราชดำเนิน แขวงพระบรมมหาราชวัง เขตพระนคร กรุงเทพฯ 10200',
      latitude: 13.7563, longitude: 100.5018,
      caregiverName: 'สมหมาย ใจดี', caregiverPhone: '0898765431',
      diseases: [
        { diseaseName: 'เบาหวานชนิดที่ 2', diseaseCode: 'E11', severity: 'MEDIUM' as const, notes: 'ควบคุมระดับน้ำตาลด้วยยา' },
        { diseaseName: 'ความดันโลหิตสูง', diseaseCode: 'I10', severity: 'MEDIUM' as const },
        { diseaseName: 'ไตเรื้อรังระยะ 3', diseaseCode: 'N18.3', severity: 'HIGH' as const, notes: 'ต้องติดตามการทำงานของไตทุก 3 เดือน' },
      ],
      medications: [
        { medicationName: 'Metformin', dosage: '500 mg', frequency: 'วันละ 2 ครั้ง (เช้า-เย็น)', prescribingHospital: 'โรงพยาบาลพระนคร', isActive: true },
        { medicationName: 'Enalapril', dosage: '10 mg', frequency: 'วันละ 1 ครั้ง (เช้า)', prescribingHospital: 'โรงพยาบาลพระนคร', isActive: true },
        { medicationName: 'Amlodipine', dosage: '5 mg', frequency: 'วันละ 1 ครั้ง (เย็น)', prescribingHospital: 'โรงพยาบาลพระนคร', isActive: true },
      ],
      caregivers: [
        { fullName: 'สมหมาย ใจดี', relationship: 'ลูกสาว', phone: '0898765431', isPrimary: true },
      ],
      emergencyContacts: [
        { contactName: 'สมพร ใจดี', relationship: 'ลูกชาย', phone: '0871234561', priorityOrder: 1 },
        { contactName: 'สมหมาย ใจดี', relationship: 'ลูกสาว', phone: '0898765431', priorityOrder: 2 },
      ],
      riskScores: [
        { score: 45, riskLevel: 'MEDIUM' as const, daysBack: 90 },
        { score: 58, riskLevel: 'MEDIUM' as const, daysBack: 60 },
        { score: 72, riskLevel: 'HIGH' as const,   daysBack: 30 },
        { score: 75, riskLevel: 'HIGH' as const,   daysBack: 14 },
        { score: 80, riskLevel: 'HIGH' as const,   daysBack: 3  },
      ],
      calls: [
        { callType: 'MEDICATION' as const, callStatus: 'SUCCESS' as const, daysBack: 1, durationSeconds: 145 },
        { callType: 'HEALTH_CHECK' as const, callStatus: 'SUCCESS' as const, daysBack: 4, durationSeconds: 210 },
        { callType: 'MEDICATION' as const, callStatus: 'NO_ANSWER' as const, daysBack: 7, durationSeconds: null },
        { callType: 'MEDICATION' as const, callStatus: 'SUCCESS' as const, daysBack: 8, durationSeconds: 130 },
      ],
      complianceLogs: [
        ...Array.from({ length: 12 }, (_, i) => ({ daysBack: i + 1, status: i % 5 === 4 ? 'MISSED' : 'TAKEN' as 'TAKEN' | 'MISSED' | 'SKIPPED' })),
      ],
      alerts: [
        { alertType: 'MEDICATION', severity: 'HIGH' as const, title: 'ลืมทานยา 3 วันติดต่อกัน', description: 'ผู้ป่วยไม่ได้ทานยา Metformin ติดต่อกัน 3 วัน', status: 'OPEN' as const, hoursBack: 18, escalationLevel: 1 },
        { alertType: 'HEALTH', severity: 'HIGH' as const, title: 'ความดันสูงขึ้น', description: 'ระดับความเสี่ยงเพิ่มขึ้นจาก MEDIUM เป็น HIGH', status: 'IN_PROGRESS' as const, hoursBack: 12 },
      ],
    },
    {
      citizenId: '3100212345679',
      firstName: 'มาลี', lastName: 'สวัสดิ์',
      gender: 'FEMALE' as const, birthDate: new Date('1953-07-22'), age: 72,
      phone: '0823456782', bloodType: 'A+',
      weight: 55.0, height: 158.0, status: 'ACTIVE' as const,
      address: '45/2 ซอยสาทร 3 ถนนสาทรใต้ แขวงทุ่งมหาเมฆ เขตสาทร กรุงเทพฯ 10120',
      latitude: 13.7200, longitude: 100.5237,
      caregiverName: 'วิภา สวัสดิ์', caregiverPhone: '0865432109',
      diseases: [
        { diseaseName: 'โรคหัวใจขาดเลือด', diseaseCode: 'I25', severity: 'HIGH' as const, notes: 'ผ่าตัดบายพาส ปี 2562' },
        { diseaseName: 'ข้ออักเสบรูมาตอยด์', diseaseCode: 'M05', severity: 'MEDIUM' as const },
      ],
      medications: [
        { medicationName: 'Aspirin', dosage: '100 mg', frequency: 'วันละ 1 ครั้ง (เช้า)', prescribingHospital: 'โรงพยาบาลสาทร', isActive: true },
        { medicationName: 'Atorvastatin', dosage: '20 mg', frequency: 'วันละ 1 ครั้ง (ก่อนนอน)', prescribingHospital: 'โรงพยาบาลสาทร', isActive: true },
        { medicationName: 'Methotrexate', dosage: '7.5 mg', frequency: 'สัปดาห์ละ 1 ครั้ง', prescribingHospital: 'โรงพยาบาลสาทร', isActive: true },
      ],
      caregivers: [
        { fullName: 'วิภา สวัสดิ์', relationship: 'ลูกสาว', phone: '0865432109', isPrimary: true },
        { fullName: 'ณัฐพล สวัสดิ์', relationship: 'ลูกชาย', phone: '0832109876', isPrimary: false },
      ],
      emergencyContacts: [
        { contactName: 'วิภา สวัสดิ์', relationship: 'ลูกสาว', phone: '0865432109', priorityOrder: 1 },
      ],
      riskScores: [
        { score: 35, riskLevel: 'MEDIUM' as const, daysBack: 60 },
        { score: 42, riskLevel: 'MEDIUM' as const, daysBack: 30 },
        { score: 38, riskLevel: 'MEDIUM' as const, daysBack: 7  },
      ],
      calls: [
        { callType: 'MEDICATION' as const, callStatus: 'SUCCESS' as const, daysBack: 2, durationSeconds: 180 },
        { callType: 'HEALTH_CHECK' as const, callStatus: 'SUCCESS' as const, daysBack: 5, durationSeconds: 240 },
      ],
      complianceLogs: [
        ...Array.from({ length: 15 }, (_, i) => ({ daysBack: i + 1, status: i % 8 === 7 ? 'SKIPPED' : 'TAKEN' as 'TAKEN' | 'MISSED' | 'SKIPPED' })),
      ],
      alerts: [
        { alertType: 'APPOINTMENT', severity: 'MEDIUM' as const, title: 'ขาดนัดพบแพทย์', description: 'ไม่ได้ไปพบแพทย์ตามนัดเมื่อวันที่ผ่านมา', status: 'RESOLVED' as const },
      ],
    },
    {
      citizenId: '3100312345670',
      firstName: 'ประยุทธ์', lastName: 'แสงทอง',
      gender: 'MALE' as const, birthDate: new Date('1957-11-04'), age: 68,
      phone: '0834567893', bloodType: 'B+',
      weight: 72.0, height: 170.0, status: 'ACTIVE' as const,
      address: '88 หมู่ 3 ถนนงามวงศ์วาน ตำบลท่าทราย อำเภอเมือง นนทบุรี 11000',
      latitude: 13.7950, longitude: 100.4120,
      caregiverName: 'รัตนา แสงทอง', caregiverPhone: '0854321098',
      diseases: [
        { diseaseName: 'เบาหวานชนิดที่ 2 (ระยะเริ่มต้น)', diseaseCode: 'E11', severity: 'LOW' as const, notes: 'ควบคุมด้วยการควบคุมอาหารและออกกำลังกาย' },
      ],
      medications: [
        { medicationName: 'Metformin', dosage: '500 mg', frequency: 'วันละ 1 ครั้ง (เช้า)', prescribingHospital: 'โรงพยาบาลนนทบุรี', isActive: true },
      ],
      caregivers: [
        { fullName: 'รัตนา แสงทอง', relationship: 'ภรรยา', phone: '0854321098', isPrimary: true },
      ],
      emergencyContacts: [
        { contactName: 'รัตนา แสงทอง', relationship: 'ภรรยา', phone: '0854321098', priorityOrder: 1 },
        { contactName: 'พิชัย แสงทอง', relationship: 'ลูกชาย', phone: '0876543210', priorityOrder: 2 },
      ],
      riskScores: [
        { score: 18, riskLevel: 'LOW' as const, daysBack: 45 },
        { score: 22, riskLevel: 'LOW' as const, daysBack: 15 },
        { score: 20, riskLevel: 'LOW' as const, daysBack: 5  },
      ],
      calls: [
        { callType: 'MEDICATION' as const, callStatus: 'SUCCESS' as const, daysBack: 3, durationSeconds: 95 },
        { callType: 'HEALTH_CHECK' as const, callStatus: 'SUCCESS' as const, daysBack: 10, durationSeconds: 175 },
      ],
      complianceLogs: [
        ...Array.from({ length: 20 }, (_, i) => ({ daysBack: i + 1, status: 'TAKEN' as 'TAKEN' | 'MISSED' | 'SKIPPED' })),
      ],
      alerts: [],
    },
    {
      citizenId: '3100412345671',
      firstName: 'สมหญิง', lastName: 'รักดี',
      gender: 'FEMALE' as const, birthDate: new Date('1944-01-30'), age: 81,
      phone: '0845678904', bloodType: 'AB+',
      weight: 50.0, height: 152.0, status: 'ACTIVE' as const,
      address: '12/4 ซอยลาดพร้าว 101 แขวงคลองจั่น เขตบางกะปิ กรุงเทพฯ 10240',
      latitude: 13.8000, longitude: 100.5600,
      caregiverName: 'สุดารัตน์ รักดี', caregiverPhone: '0887654321',
      diseases: [
        { diseaseName: 'โรคหลอดเลือดสมอง (Ischemic Stroke)', diseaseCode: 'I63', severity: 'HIGH' as const, notes: 'เกิดเหตุการณ์ปี 2563 มีผลต่อการพูดและการเคลื่อนไหวด้านขวา' },
        { diseaseName: 'ภาวะสมองเสื่อม (Dementia)', diseaseCode: 'F03', severity: 'MEDIUM' as const, notes: 'ระยะปานกลาง ต้องการการดูแลตลอดเวลา' },
        { diseaseName: 'เบาหวานชนิดที่ 2', diseaseCode: 'E11', severity: 'MEDIUM' as const },
        { diseaseName: 'ความดันโลหิตสูง', diseaseCode: 'I10', severity: 'MEDIUM' as const },
      ],
      medications: [
        { medicationName: 'Aspirin', dosage: '100 mg', frequency: 'วันละ 1 ครั้ง', prescribingHospital: 'โรงพยาบาลรามาธิบดี', isActive: true },
        { medicationName: 'Aricept (Donepezil)', dosage: '10 mg', frequency: 'วันละ 1 ครั้ง (ก่อนนอน)', prescribingHospital: 'โรงพยาบาลรามาธิบดี', isActive: true },
        { medicationName: 'Metformin', dosage: '500 mg', frequency: 'วันละ 2 ครั้ง', prescribingHospital: 'โรงพยาบาลรามาธิบดี', isActive: true },
        { medicationName: 'Amlodipine', dosage: '10 mg', frequency: 'วันละ 1 ครั้ง', prescribingHospital: 'โรงพยาบาลรามาธิบดี', isActive: true },
      ],
      caregivers: [
        { fullName: 'สุดารัตน์ รักดี', relationship: 'ลูกสาว', phone: '0887654321', isPrimary: true },
        { fullName: 'บุญมี รักดี', relationship: 'ลูกชาย', phone: '0812345670', isPrimary: false },
      ],
      emergencyContacts: [
        { contactName: 'สุดารัตน์ รักดี', relationship: 'ลูกสาว', phone: '0887654321', priorityOrder: 1 },
        { contactName: 'บุญมี รักดี', relationship: 'ลูกชาย', phone: '0812345670', priorityOrder: 2 },
        { contactName: 'โรงพยาบาลรามาธิบดี', relationship: 'โรงพยาบาล', phone: '022012000', priorityOrder: 3 },
      ],
      riskScores: [
        { score: 65, riskLevel: 'HIGH' as const,     daysBack: 120 },
        { score: 78, riskLevel: 'HIGH' as const,     daysBack: 90  },
        { score: 85, riskLevel: 'CRITICAL' as const, daysBack: 60  },
        { score: 88, riskLevel: 'CRITICAL' as const, daysBack: 30  },
        { score: 92, riskLevel: 'CRITICAL' as const, daysBack: 7   },
      ],
      calls: [
        { callType: 'MEDICATION' as const, callStatus: 'NO_ANSWER' as const, daysBack: 1, durationSeconds: null },
        { callType: 'MEDICATION' as const, callStatus: 'NO_ANSWER' as const, daysBack: 2, durationSeconds: null },
        { callType: 'HEALTH_CHECK' as const, callStatus: 'SUCCESS' as const, daysBack: 3, durationSeconds: 320 },
        { callType: 'MEDICATION' as const, callStatus: 'FAILED' as const, daysBack: 5, durationSeconds: null },
      ],
      complianceLogs: [
        ...Array.from({ length: 20 }, (_, i) => ({ daysBack: i + 1, status: (i % 3 === 0 ? 'MISSED' : i % 5 === 4 ? 'SKIPPED' : 'TAKEN') as 'TAKEN' | 'MISSED' | 'SKIPPED' })),
      ],
      alerts: [
        { alertType: 'EMERGENCY', severity: 'CRITICAL' as const, title: 'ความเสี่ยงสูงมาก - ต้องการดูแลเร่งด่วน', description: 'ผู้ป่วยมีความเสี่ยงล้มสูง เนื่องจากโรคหลอดเลือดสมองและสมองเสื่อม', status: 'OPEN' as const, hoursBack: 2, escalationLevel: 2 },
        { alertType: 'MEDICATION', severity: 'CRITICAL' as const, title: 'ไม่ได้ทานยาหลายวัน', description: 'ขาดยา Aricept ซึ่งจำเป็นต่อการชะลอภาวะสมองเสื่อม', status: 'IN_PROGRESS' as const, hoursBack: 6 },
        { alertType: 'HEALTH', severity: 'HIGH' as const, title: 'พฤติกรรมเปลี่ยนแปลงผิดปกติ', description: 'ผู้ดูแลแจ้งว่าผู้ป่วยสับสนและกระวนกระวายมากขึ้นในช่วงกลางคืน', status: 'OPEN' as const, hoursBack: 36, escalationLevel: 1 },
      ],
    },
    {
      citizenId: '3100512345672',
      firstName: 'วิชัย', lastName: 'มีสุข',
      gender: 'MALE' as const, birthDate: new Date('1950-05-18'), age: 75,
      phone: '0856789015', bloodType: 'O-',
      weight: 60.0, height: 168.0, status: 'ACTIVE' as const,
      address: '67 ถนนนวมินทร์ แขวงคลองกุ่ม เขตบึงกุ่ม กรุงเทพฯ 10230',
      latitude: 13.6800, longitude: 100.6100,
      caregiverName: 'จันทร์เพ็ญ มีสุข', caregiverPhone: '0876543219',
      diseases: [
        { diseaseName: 'ปอดอุดกั้นเรื้อรัง (COPD)', diseaseCode: 'J44', severity: 'HIGH' as const, notes: 'สูบบุหรี่มา 40 ปี หยุดได้ 5 ปีแล้ว ใช้ยาสูดพ่น' },
        { diseaseName: 'หัวใจล้มเหลว', diseaseCode: 'I50', severity: 'MEDIUM' as const, notes: 'EF 40%' },
      ],
      medications: [
        { medicationName: 'Salbutamol inhaler', dosage: '100 mcg/dose', frequency: 'เมื่อมีอาการ', prescribingHospital: 'โรงพยาบาลบึงกุ่ม', isActive: true },
        { medicationName: 'Budesonide/Formoterol inhaler', dosage: '160/4.5 mcg', frequency: 'วันละ 2 ครั้ง (เช้า-เย็น)', prescribingHospital: 'โรงพยาบาลบึงกุ่ม', isActive: true },
        { medicationName: 'Furosemide', dosage: '40 mg', frequency: 'วันละ 1 ครั้ง (เช้า)', prescribingHospital: 'โรงพยาบาลบึงกุ่ม', isActive: true },
      ],
      caregivers: [
        { fullName: 'จันทร์เพ็ญ มีสุข', relationship: 'ภรรยา', phone: '0876543219', isPrimary: true },
      ],
      emergencyContacts: [
        { contactName: 'จันทร์เพ็ญ มีสุข', relationship: 'ภรรยา', phone: '0876543219', priorityOrder: 1 },
        { contactName: 'สุทธิชัย มีสุข', relationship: 'ลูกชาย', phone: '0823456781', priorityOrder: 2 },
      ],
      riskScores: [
        { score: 55, riskLevel: 'MEDIUM' as const, daysBack: 60 },
        { score: 68, riskLevel: 'HIGH' as const,   daysBack: 30 },
        { score: 74, riskLevel: 'HIGH' as const,   daysBack: 14 },
        { score: 76, riskLevel: 'HIGH' as const,   daysBack: 5  },
      ],
      calls: [
        { callType: 'HEALTH_CHECK' as const, callStatus: 'SUCCESS' as const, daysBack: 2, durationSeconds: 280 },
        { callType: 'MEDICATION' as const, callStatus: 'SUCCESS' as const, daysBack: 6, durationSeconds: 155 },
        { callType: 'HEALTH_CHECK' as const, callStatus: 'BUSY' as const, daysBack: 9, durationSeconds: null },
      ],
      complianceLogs: [
        ...Array.from({ length: 15 }, (_, i) => ({ daysBack: i + 1, status: (i % 4 === 3 ? 'MISSED' : 'TAKEN') as 'TAKEN' | 'MISSED' | 'SKIPPED' })),
      ],
      alerts: [
        { alertType: 'HEALTH', severity: 'HIGH' as const, title: 'อาการหายใจลำบากเพิ่มขึ้น', description: 'ผู้ป่วยรายงานว่าเหนื่อยง่ายและหายใจลำบากขึ้นในสัปดาห์ที่ผ่านมา', status: 'IN_PROGRESS' as const, hoursBack: 10 },
      ],
    },
    {
      citizenId: '3100612345673',
      firstName: 'อรนุช', lastName: 'พงษ์ศิริ',
      gender: 'FEMALE' as const, birthDate: new Date('1955-09-12'), age: 70,
      phone: '0867890126', bloodType: 'A-',
      weight: 58.0, height: 155.0, status: 'ACTIVE' as const,
      address: '234 ซอยบางระมาด 7 ถนนชัยพฤกษ์ แขวงตลิ่งชัน เขตตลิ่งชัน กรุงเทพฯ 10170',
      latitude: 13.7400, longitude: 100.4700,
      caregiverName: 'ปิยะ พงษ์ศิริ', caregiverPhone: '0865432108',
      diseases: [
        { diseaseName: 'กระดูกพรุน', diseaseCode: 'M81', severity: 'MEDIUM' as const, notes: 'T-score -2.8 ที่สะโพก ได้รับการรักษาด้วยยา Bisphosphonate' },
        { diseaseName: 'ข้ออักเสบ (Osteoarthritis)', diseaseCode: 'M19', severity: 'LOW' as const, notes: 'ข้อเข่าทั้งสองข้าง' },
      ],
      medications: [
        { medicationName: 'Alendronate', dosage: '70 mg', frequency: 'สัปดาห์ละ 1 ครั้ง (เช้าวันจันทร์ ก่อนอาหาร 30 นาที)', prescribingHospital: 'โรงพยาบาลตลิ่งชัน', isActive: true },
        { medicationName: 'Calcium + Vitamin D3', dosage: '600 mg / 400 IU', frequency: 'วันละ 2 ครั้ง', prescribingHospital: 'โรงพยาบาลตลิ่งชัน', isActive: true },
      ],
      caregivers: [
        { fullName: 'ปิยะ พงษ์ศิริ', relationship: 'สามี', phone: '0865432108', isPrimary: true },
        { fullName: 'ปรียา จันทร์ดี', relationship: 'ลูกสาว', phone: '0843219876', isPrimary: false },
      ],
      emergencyContacts: [
        { contactName: 'ปิยะ พงษ์ศิริ', relationship: 'สามี', phone: '0865432108', priorityOrder: 1 },
      ],
      riskScores: [
        { score: 15, riskLevel: 'LOW' as const, daysBack: 30 },
        { score: 18, riskLevel: 'LOW' as const, daysBack: 10 },
        { score: 16, riskLevel: 'LOW' as const, daysBack: 2  },
      ],
      calls: [
        { callType: 'MEDICATION' as const, callStatus: 'SUCCESS' as const, daysBack: 4, durationSeconds: 110 },
        { callType: 'HEALTH_CHECK' as const, callStatus: 'SUCCESS' as const, daysBack: 14, durationSeconds: 190 },
      ],
      complianceLogs: [
        ...Array.from({ length: 18 }, (_, i) => ({ daysBack: i + 1, status: 'TAKEN' as 'TAKEN' | 'MISSED' | 'SKIPPED' })),
      ],
      alerts: [],
    },
    {
      citizenId: '3100712345674',
      firstName: 'สุรชัย', lastName: 'มีชัย',
      gender: 'MALE' as const, birthDate: new Date('1952-02-28'), age: 73,
      phone: '0878901237', bloodType: 'B-',
      weight: 78.0, height: 172.0, status: 'ACTIVE' as const,
      address: '56/1 ถนนพหลโยธิน แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900',
      latitude: 13.8200, longitude: 100.5400,
      caregiverName: 'กนกวรรณ มีชัย', caregiverPhone: '0854321087',
      diseases: [
        { diseaseName: 'เก๊าท์', diseaseCode: 'M10', severity: 'MEDIUM' as const, notes: 'ระดับกรดยูริกสูง ต้องควบคุมอาหาร' },
        { diseaseName: 'เบาหวานชนิดที่ 2', diseaseCode: 'E11', severity: 'LOW' as const },
      ],
      medications: [
        { medicationName: 'Allopurinol', dosage: '300 mg', frequency: 'วันละ 1 ครั้ง (เช้า)', prescribingHospital: 'โรงพยาบาลจตุจักร', isActive: true },
        { medicationName: 'Metformin', dosage: '500 mg', frequency: 'วันละ 1 ครั้ง (เช้า)', prescribingHospital: 'โรงพยาบาลจตุจักร', isActive: true },
        { medicationName: 'Colchicine', dosage: '0.5 mg', frequency: 'เมื่อมีอาการกำเริบ', prescribingHospital: 'โรงพยาบาลจตุจักร', isActive: false },
      ],
      caregivers: [
        { fullName: 'กนกวรรณ มีชัย', relationship: 'ภรรยา', phone: '0854321087', isPrimary: true },
      ],
      emergencyContacts: [
        { contactName: 'กนกวรรณ มีชัย', relationship: 'ภรรยา', phone: '0854321087', priorityOrder: 1 },
        { contactName: 'ชาญชัย มีชัย', relationship: 'ลูกชาย', phone: '0821098765', priorityOrder: 2 },
      ],
      riskScores: [
        { score: 30, riskLevel: 'MEDIUM' as const, daysBack: 45 },
        { score: 28, riskLevel: 'LOW' as const,    daysBack: 20 },
        { score: 35, riskLevel: 'MEDIUM' as const, daysBack: 5  },
      ],
      calls: [
        { callType: 'MEDICATION' as const, callStatus: 'SUCCESS' as const, daysBack: 3, durationSeconds: 135 },
        { callType: 'HEALTH_CHECK' as const, callStatus: 'SUCCESS' as const, daysBack: 8, durationSeconds: 205 },
        { callType: 'MEDICATION' as const, callStatus: 'NO_ANSWER' as const, daysBack: 12, durationSeconds: null },
      ],
      complianceLogs: [
        ...Array.from({ length: 14 }, (_, i) => ({ daysBack: i + 1, status: (i % 6 === 5 ? 'MISSED' : 'TAKEN') as 'TAKEN' | 'MISSED' | 'SKIPPED' })),
      ],
      alerts: [
        { alertType: 'HEALTH', severity: 'LOW' as const, title: 'แจ้งเตือนอาหาร', description: 'ควรหลีกเลี่ยงอาหารที่มีพิวรีนสูงเพื่อป้องกันเก๊าท์กำเริบ', status: 'CLOSED' as const },
      ],
    },
    {
      citizenId: '3100812345675',
      firstName: 'นงนุช', lastName: 'ทองดี',
      gender: 'FEMALE' as const, birthDate: new Date('1940-06-15'), age: 85,
      phone: '0889012348', bloodType: 'O+',
      weight: 45.0, height: 148.0, status: 'ACTIVE' as const,
      address: '8 ซอยอ่อนนุช 46 ถนนอ่อนนุช แขวงประเวศ เขตประเวศ กรุงเทพฯ 10250',
      latitude: 13.7600, longitude: 100.5800,
      caregiverName: 'สมศรี ทองดี', caregiverPhone: '0843210987',
      diseases: [
        { diseaseName: 'ภาวะสมองเสื่อมระยะรุนแรง (Severe Dementia)', diseaseCode: 'F03', severity: 'HIGH' as const, notes: 'ไม่สามารถช่วยเหลือตัวเองได้ ต้องการผู้ดูแลตลอด 24 ชั่วโมง' },
        { diseaseName: 'ความดันโลหิตสูง', diseaseCode: 'I10', severity: 'MEDIUM' as const },
        { diseaseName: 'โรคหัวใจ', diseaseCode: 'I25', severity: 'MEDIUM' as const },
        { diseaseName: 'เบาหวาน', diseaseCode: 'E11', severity: 'LOW' as const },
        { diseaseName: 'ภาวะทุพโภชนาการ', diseaseCode: 'E46', severity: 'MEDIUM' as const, notes: 'น้ำหนักลดลงมากในช่วง 6 เดือน' },
      ],
      medications: [
        { medicationName: 'Donepezil', dosage: '10 mg', frequency: 'วันละ 1 ครั้ง (ก่อนนอน)', prescribingHospital: 'โรงพยาบาลประเวศ', isActive: true },
        { medicationName: 'Amlodipine', dosage: '5 mg', frequency: 'วันละ 1 ครั้ง', prescribingHospital: 'โรงพยาบาลประเวศ', isActive: true },
        { medicationName: 'Aspirin', dosage: '100 mg', frequency: 'วันละ 1 ครั้ง', prescribingHospital: 'โรงพยาบาลประเวศ', isActive: true },
      ],
      caregivers: [
        { fullName: 'สมศรี ทองดี', relationship: 'ลูกสาว', phone: '0843210987', isPrimary: true },
        { fullName: 'ประวิทย์ ทองดี', relationship: 'ลูกชาย', phone: '0810987654', isPrimary: false },
      ],
      emergencyContacts: [
        { contactName: 'สมศรี ทองดี', relationship: 'ลูกสาว', phone: '0843210987', priorityOrder: 1 },
        { contactName: 'ประวิทย์ ทองดี', relationship: 'ลูกชาย', phone: '0810987654', priorityOrder: 2 },
        { contactName: 'โรงพยาบาลประเวศ', relationship: 'โรงพยาบาล', phone: '022106000', priorityOrder: 3 },
      ],
      riskScores: [
        { score: 80, riskLevel: 'CRITICAL' as const, daysBack: 90  },
        { score: 85, riskLevel: 'CRITICAL' as const, daysBack: 60  },
        { score: 88, riskLevel: 'CRITICAL' as const, daysBack: 30  },
        { score: 91, riskLevel: 'CRITICAL' as const, daysBack: 14  },
        { score: 93, riskLevel: 'CRITICAL' as const, daysBack: 3   },
      ],
      calls: [
        { callType: 'HEALTH_CHECK' as const, callStatus: 'SUCCESS' as const, daysBack: 1, durationSeconds: 480 },
        { callType: 'MEDICATION' as const, callStatus: 'SUCCESS' as const, daysBack: 2, durationSeconds: 370 },
        { callType: 'HEALTH_CHECK' as const, callStatus: 'SUCCESS' as const, daysBack: 4, durationSeconds: 420 },
      ],
      complianceLogs: [
        ...Array.from({ length: 20 }, (_, i) => ({ daysBack: i + 1, status: (i % 3 === 2 ? 'MISSED' : i % 7 === 6 ? 'SKIPPED' : 'TAKEN') as 'TAKEN' | 'MISSED' | 'SKIPPED' })),
      ],
      alerts: [
        { alertType: 'EMERGENCY', severity: 'CRITICAL' as const, title: 'ต้องการการดูแลเร่งด่วน', description: 'ระดับความเสี่ยงสูงสุด ต้องการการประเมินโดยแพทย์', status: 'OPEN' as const, hoursBack: 1, escalationLevel: 3 },
        { alertType: 'HEALTH', severity: 'HIGH' as const, title: 'น้ำหนักลดลงผิดปกติ', description: 'น้ำหนักลดลง 5 กก. ใน 2 เดือน ควรปรึกษานักโภชนาการ', status: 'IN_PROGRESS' as const, hoursBack: 8 },
        { alertType: 'MEDICATION', severity: 'HIGH' as const, title: 'ขาดยา Donepezil', description: 'ยาสำคัญสำหรับภาวะสมองเสื่อมไม่ได้ทานตามกำหนด', status: 'OPEN' as const, hoursBack: 4, escalationLevel: 1 },
      ],
    },
    {
      citizenId: '3100912345676',
      firstName: 'ธงชัย', lastName: 'รุ่งเรือง',
      gender: 'MALE' as const, birthDate: new Date('1956-12-03'), age: 69,
      phone: '0890123459', bloodType: 'A+',
      weight: 70.0, height: 167.0, status: 'ACTIVE' as const,
      address: '199/5 ถนนนราธิวาสราชนครินทร์ แขวงช่องนนทรี เขตยานนาวา กรุงเทพฯ 10120',
      latitude: 13.7000, longitude: 100.5100,
      caregiverName: 'ลัดดา รุ่งเรือง', caregiverPhone: '0832109865',
      diseases: [
        { diseaseName: 'ความดันโลหิตสูง (เล็กน้อย)', diseaseCode: 'I10', severity: 'LOW' as const, notes: 'ควบคุมด้วยยา ระดับความดันคงที่' },
      ],
      medications: [
        { medicationName: 'Losartan', dosage: '50 mg', frequency: 'วันละ 1 ครั้ง (เช้า)', prescribingHospital: 'คลินิกยานนาวา', isActive: true },
      ],
      caregivers: [
        { fullName: 'ลัดดา รุ่งเรือง', relationship: 'ภรรยา', phone: '0832109865', isPrimary: true },
      ],
      emergencyContacts: [
        { contactName: 'ลัดดา รุ่งเรือง', relationship: 'ภรรยา', phone: '0832109865', priorityOrder: 1 },
      ],
      riskScores: [
        { score: 12, riskLevel: 'LOW' as const, daysBack: 30 },
        { score: 15, riskLevel: 'LOW' as const, daysBack: 7  },
        { score: 13, riskLevel: 'LOW' as const, daysBack: 2  },
      ],
      calls: [
        { callType: 'MEDICATION' as const, callStatus: 'SUCCESS' as const, daysBack: 5, durationSeconds: 85 },
      ],
      complianceLogs: [
        ...Array.from({ length: 25 }, (_, i) => ({ daysBack: i + 1, status: (i === 15 ? 'MISSED' : 'TAKEN') as 'TAKEN' | 'MISSED' | 'SKIPPED' })),
      ],
      alerts: [],
    },
    {
      citizenId: '3101012345677',
      firstName: 'วันดี', lastName: 'สุขใจ',
      gender: 'FEMALE' as const, birthDate: new Date('1948-08-20'), age: 77,
      phone: '0801234560', bloodType: 'AB-',
      weight: 52.0, height: 156.0, status: 'INACTIVE' as const,
      address: '77 หมู่ 5 ถนนรัชดาภิเษก แขวงลาดยาว เขตจตุจักร กรุงเทพฯ 10900',
      latitude: 13.7800, longitude: 100.5200,
      caregiverName: 'สมใจ สุขใจ', caregiverPhone: '0821098764',
      diseases: [
        { diseaseName: 'เบาหวานชนิดที่ 2', diseaseCode: 'E11', severity: 'MEDIUM' as const },
        { diseaseName: 'มะเร็งเต้านม (ระยะสงบ)', diseaseCode: 'C50', severity: 'MEDIUM' as const, notes: 'รักษาเสร็จสิ้น ปี 2564 อยู่ระหว่างติดตามผล 5 ปี' },
      ],
      medications: [
        { medicationName: 'Tamoxifen', dosage: '20 mg', frequency: 'วันละ 1 ครั้ง', prescribingHospital: 'โรงพยาบาลจุฬาลงกรณ์', isActive: true },
        { medicationName: 'Metformin', dosage: '500 mg', frequency: 'วันละ 2 ครั้ง (เช้า-เย็น)', prescribingHospital: 'โรงพยาบาลจุฬาลงกรณ์', isActive: true },
      ],
      caregivers: [
        { fullName: 'สมใจ สุขใจ', relationship: 'สามี', phone: '0821098764', isPrimary: true },
        { fullName: 'สาวิตรี เจริญ', relationship: 'ลูกสาว', phone: '0809876543', isPrimary: false },
      ],
      emergencyContacts: [
        { contactName: 'สาวิตรี เจริญ', relationship: 'ลูกสาว', phone: '0809876543', priorityOrder: 1 },
        { contactName: 'โรงพยาบาลจุฬาลงกรณ์', relationship: 'โรงพยาบาล', phone: '022564000', priorityOrder: 2 },
      ],
      riskScores: [
        { score: 40, riskLevel: 'MEDIUM' as const, daysBack: 60 },
        { score: 35, riskLevel: 'MEDIUM' as const, daysBack: 30 },
        { score: 38, riskLevel: 'MEDIUM' as const, daysBack: 10 },
      ],
      calls: [
        { callType: 'HEALTH_CHECK' as const, callStatus: 'SUCCESS' as const, daysBack: 6, durationSeconds: 225 },
        { callType: 'MEDICATION' as const, callStatus: 'SUCCESS' as const, daysBack: 13, durationSeconds: 150 },
      ],
      complianceLogs: [
        ...Array.from({ length: 20 }, (_, i) => ({ daysBack: i + 1, status: (i % 10 === 9 ? 'SKIPPED' : 'TAKEN') as 'TAKEN' | 'MISSED' | 'SKIPPED' })),
      ],
      alerts: [
        { alertType: 'APPOINTMENT', severity: 'MEDIUM' as const, title: 'ครบกำหนดตรวจมะเร็ง', description: 'ถึงกำหนดตรวจติดตามมะเร็งเต้านมประจำปี กรุณานัดพบแพทย์', status: 'OPEN' as const, hoursBack: 72 },
      ],
    },
  ];

  let elderlyCreated = 0;
  for (const e of ELDERLY_SEED) {
    const existing = await prisma.elderly.findFirst({ where: { citizenId: e.citizenId } });
    if (existing) {
      // Add any OPEN alerts from seed data that don't already exist
      const openAlerts = e.alerts.filter(a => (a as any).status === 'OPEN');
      const existingOpenCount = await prisma.alert.count({ where: { elderlyId: existing.id, status: 'OPEN' } });
      if (existingOpenCount === 0 && openAlerts.length > 0) {
        for (const a of openAlerts) {
          const aa = a as any;
          await prisma.alert.create({
            data: {
              elderlyId:      existing.id,
              alertType:      aa.alertType as any,
              severity:       aa.severity,
              title:          aa.title,
              description:    aa.description,
              status:         aa.status,
              escalationLevel: aa.escalationLevel ?? 0,
              createdAt:      aa.hoursBack ? hoursAgo(aa.hoursBack) : new Date(),
            },
          });
        }
        console.log(`   ✅ เพิ่ม ${openAlerts.length} OPEN alerts → ${e.firstName} ${e.lastName}`);
      } else {
        console.log(`   ⚠️  ข้ามแล้ว (มีอยู่แล้ว): ${e.firstName} ${e.lastName}`);
      }
      continue;
    }

    const elderly = await prisma.elderly.create({
      data: {
        organizationId:  organization.id,
        citizenId:       e.citizenId,
        firstName:       e.firstName,
        lastName:        e.lastName,
        gender:          e.gender,
        birthDate:       e.birthDate,
        age:             e.age,
        phone:           e.phone,
        bloodType:       e.bloodType,
        weight:          e.weight,
        height:          e.height,
        status:          e.status,
        address:         e.address,
        latitude:        e.latitude,
        longitude:       e.longitude,
        caregiverName:   e.caregiverName,
        caregiverPhone:  e.caregiverPhone,
        diseases: {
          create: e.diseases.map((d) => ({
            diseaseCode:   d.diseaseCode,
            diseaseName:   d.diseaseName,
            severity:      d.severity as any,
            notes:         d.notes ?? null,
            diagnosedDate: daysAgo(Math.floor(Math.random() * 365 * 3)),
          })),
        },
        medications: {
          create: e.medications.map((m) => ({
            medicationName:      m.medicationName,
            dosage:              m.dosage,
            frequency:           m.frequency,
            prescribingHospital: m.prescribingHospital,
            isActive:            m.isActive,
            startDate:           daysAgo(Math.floor(Math.random() * 365)),
          })),
        },
        caregivers: {
          create: e.caregivers.map((c) => ({
            fullName:     c.fullName,
            relationship: c.relationship,
            phone:        c.phone,
            isPrimary:    c.isPrimary,
          })),
        },
        emergencyContacts: {
          create: e.emergencyContacts.map((ec) => ({
            contactName:   ec.contactName,
            relationship:  ec.relationship,
            phone:         ec.phone,
            priorityOrder: ec.priorityOrder,
          })),
        },
      },
    });

    // Risk scores
    for (const rs of e.riskScores) {
      await prisma.riskScore.create({
        data: {
          elderlyId:    elderly.id,
          score:        rs.score,
          riskLevel:    rs.riskLevel,
          calculatedAt: daysAgo(rs.daysBack),
          factors: {
            diseaseCount:    e.diseases.length,
            missedMedications: Math.floor(Math.random() * 5),
            sentimentScore:  parseFloat((Math.random() * 0.6 + 0.2).toFixed(2)),
            lonelinessScore: parseFloat((Math.random() * 0.5 + 0.1).toFixed(2)),
          },
        },
      });
    }

    // Calls
    for (const c of e.calls) {
      const startedAt = daysAgo(c.daysBack);
      const endedAt   = c.durationSeconds
        ? new Date(startedAt.getTime() + c.durationSeconds * 1000)
        : null;
      await prisma.call.create({
        data: {
          elderlyId:       elderly.id,
          phoneNumber:     e.phone ?? '0800000000',
          callType:        c.callType,
          callStatus:      c.callStatus,
          startedAt,
          endedAt,
          durationSeconds: c.durationSeconds ?? null,
        },
      });
    }

    // Medication logs (compliance)
    const medications = await prisma.medication.findMany({
      where: { elderlyId: elderly.id, isActive: true },
      select: { id: true },
      take: 1,
    });
    if (medications.length > 0) {
      for (const log of e.complianceLogs) {
        const scheduled = daysAgo(log.daysBack);
        scheduled.setHours(8, 0, 0, 0);
        await prisma.medicationLog.create({
          data: {
            medicationId:  medications[0].id,
            elderlyId:     elderly.id,
            scheduledTime: scheduled,
            takenTime:     log.status === 'TAKEN' ? new Date(scheduled.getTime() + 15 * 60000) : null,
            status:        log.status,
            source:        'OFFICER',
          },
        });
      }
    }

    // Alerts
    for (const a of e.alerts) {
      const aa = a as any;
      await prisma.alert.create({
        data: {
          elderlyId:      elderly.id,
          alertType:      aa.alertType as any,
          severity:       aa.severity,
          title:          aa.title,
          description:    aa.description,
          status:         aa.status,
          escalationLevel: aa.escalationLevel ?? 0,
          createdAt:      aa.hoursBack ? hoursAgo(aa.hoursBack) : new Date(),
        },
      });
    }

    console.log(`   ✅ ${e.firstName} ${e.lastName} (${e.status}, ${e.diseases.length} โรค, ${e.medications.length} ยา)`);
    elderlyCreated++;
  }

  console.log(`\n   รวม: เพิ่มผู้สูงอายุ ${elderlyCreated} ราย\n`);

  // ----------------------------------------------------------
  // Section 7: Seed Appointments for the 10 elderly profiles
  // ----------------------------------------------------------
  console.log('📅 Section 7: Seeding appointments...');

  // Re-fetch the 10 seeded elderly in order (by citizenId prefix 1-10)
  const seededElderly = await prisma.elderly.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, firstName: true, lastName: true },
    take: 10,
  });

  // Helper: build a Date relative to today
  function daysFromNow(d: number, h = 9, m = 0): Date {
    const dt = new Date();
    dt.setDate(dt.getDate() + d);
    dt.setHours(h, m, 0, 0);
    return dt;
  }

  // appointment templates  [daysFromNow, hour, minute, hospital, dept, doctor, purpose, status]
  type ApptTemplate = {
    d: number; h: number; m: number;
    hospital: string; dept: string; doctor: string; purpose: string;
    status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'MISSED';
  };

  const apptData: { elderlyIdx: number; appts: ApptTemplate[] }[] = [
    {
      elderlyIdx: 0, // สมชาย
      appts: [
        { d:  0, h:  9, m:  0, hospital: 'โรงพยาบาลรามาธิบดี',   dept: 'อายุรกรรม',     doctor: 'นพ.สมศักดิ์ วงษ์ดี',    purpose: 'ติดตามโรคเบาหวาน', status: 'SCHEDULED' },
        { d: -8, h: 10, m: 30, hospital: 'โรงพยาบาลรามาธิบดี',   dept: 'อายุรกรรม',     doctor: 'นพ.สมศักดิ์ วงษ์ดี',    purpose: 'ตรวจน้ำตาลในเลือด', status: 'COMPLETED' },
        { d:-22, h:  9, m:  0, hospital: 'คลินิกชุมชน',            dept: 'ทั่วไป',         doctor: 'นพ.วิชัย มั่นคง',       purpose: 'ตรวจสุขภาพประจำเดือน', status: 'MISSED' },
      ],
    },
    {
      elderlyIdx: 1, // มาลี
      appts: [
        { d:  0, h: 13, m: 30, hospital: 'โรงพยาบาลสิรินธร',      dept: 'โรคหัวใจ',      doctor: 'นพ.ธีรภัทร์ ชาญชัย',   purpose: 'ตรวจหัวใจ EKG', status: 'SCHEDULED' },
        { d:  1, h: 10, m:  0, hospital: 'โรงพยาบาลสิรินธร',      dept: 'โรคหัวใจ',      doctor: 'นพ.ธีรภัทร์ ชาญชัย',   purpose: 'รับผลเลือด', status: 'SCHEDULED' },
        { d:-15, h:  9, m:  0, hospital: 'โรงพยาบาลสิรินธร',      dept: 'ทั่วไป',         doctor: 'พญ.สุวรรณา ใจดี',      purpose: 'ตรวจความดันโลหิต', status: 'COMPLETED' },
      ],
    },
    {
      elderlyIdx: 2, // สมหญิง
      appts: [
        { d:  1, h: 11, m:  0, hospital: 'โรงพยาบาลจุฬาลงกรณ์',  dept: 'กระดูกและข้อ', doctor: 'นพ.ประสิทธิ์ หาญกล้า', purpose: 'เอกซเรย์ข้อเข่า', status: 'SCHEDULED' },
        { d: -5, h: 14, m:  0, hospital: 'โรงพยาบาลจุฬาลงกรณ์',  dept: 'กระดูกและข้อ', doctor: 'นพ.ประสิทธิ์ หาญกล้า', purpose: 'ติดตามอาการปวดข้อ', status: 'MISSED' },
        { d:-18, h:  9, m: 30, hospital: 'คลินิกใกล้บ้าน',         dept: 'ทั่วไป',         doctor: 'นพ.มาโนช สุขใจ',       purpose: 'ตรวจสุขภาพ', status: 'COMPLETED' },
      ],
    },
    {
      elderlyIdx: 3, // วิชัย
      appts: [
        { d:  0, h: 15, m: 30, hospital: 'โรงพยาบาลตากสิน',       dept: 'อายุรกรรม',     doctor: 'พญ.ลลิตา งามวงศ์',     purpose: 'ติดตามโรคความดัน', status: 'SCHEDULED' },
        { d:  3, h: 10, m:  0, hospital: 'โรงพยาบาลตากสิน',       dept: 'ฟัน',            doctor: 'ทพ.อนุชา เพชรดี',      purpose: 'ถอนฟัน', status: 'SCHEDULED' },
        { d:-12, h:  9, m:  0, hospital: 'โรงพยาบาลตากสิน',       dept: 'อายุรกรรม',     doctor: 'พญ.ลลิตา งามวงศ์',     purpose: 'รับผลเลือดประจำปี', status: 'COMPLETED' },
      ],
    },
    {
      elderlyIdx: 4, // ประทุม
      appts: [
        { d:  2, h: 11, m: 30, hospital: 'โรงพยาบาลมหาราช',       dept: 'จิตเวช',        doctor: 'นพ.บุญมี ศรีสุข',       purpose: 'ติดตามอาการซึมเศร้า', status: 'SCHEDULED' },
        { d: -3, h: 13, m:  0, hospital: 'โรงพยาบาลมหาราช',       dept: 'จิตเวช',        doctor: 'นพ.บุญมี ศรีสุข',       purpose: 'ประเมินสุขภาพจิต', status: 'MISSED' },
        { d:-20, h: 10, m:  0, hospital: 'คลินิกชุมชน',            dept: 'ทั่วไป',         doctor: 'นพ.จรัส ใจกว้าง',      purpose: 'ตรวจสุขภาพ', status: 'COMPLETED' },
      ],
    },
    {
      elderlyIdx: 5, // อนันต์
      appts: [
        { d:  1, h: 14, m:  0, hospital: 'โรงพยาบาลราชวิถี',      dept: 'โรคปอด',        doctor: 'นพ.กิตติ เด่นชัย',     purpose: 'ตรวจสมรรถภาพปอด', status: 'SCHEDULED' },
        { d: -6, h:  9, m: 30, hospital: 'โรงพยาบาลราชวิถี',      dept: 'โรคปอด',        doctor: 'นพ.กิตติ เด่นชัย',     purpose: 'ติดตามอาการ COPD', status: 'MISSED' },
        { d:-14, h: 10, m:  0, hospital: 'โรงพยาบาลราชวิถี',      dept: 'โรคปอด',        doctor: 'นพ.กิตติ เด่นชัย',     purpose: 'รับยาประจำ', status: 'COMPLETED' },
      ],
    },
    {
      elderlyIdx: 6, // จันทรา
      appts: [
        { d:  0, h: 10, m:  0, hospital: 'โรงพยาบาลเลิดสิน',      dept: 'ตา หู คอ จมูก', doctor: 'นพ.ชาตรี แก้วงาม',    purpose: 'ตรวจสายตา', status: 'SCHEDULED' },
        { d:  4, h: 13, m: 30, hospital: 'โรงพยาบาลเลิดสิน',      dept: 'ตา หู คอ จมูก', doctor: 'นพ.ชาตรี แก้วงาม',    purpose: 'รับแว่น', status: 'SCHEDULED' },
        { d:-10, h:  9, m:  0, hospital: 'คลินิกชุมชน',            dept: 'ทั่วไป',         doctor: 'พญ.นิภา สวยงาม',       purpose: 'ตรวจสุขภาพ', status: 'COMPLETED' },
      ],
    },
    {
      elderlyIdx: 7, // สุรชัย
      appts: [
        { d:  1, h:  9, m:  0, hospital: 'โรงพยาบาลนพรัตน์',      dept: 'ศัลยกรรม',      doctor: 'นพ.ทวีศักดิ์ สมาน',   purpose: 'ติดตามแผลผ่าตัด', status: 'SCHEDULED' },
        { d: -7, h: 14, m:  0, hospital: 'โรงพยาบาลนพรัตน์',      dept: 'ศัลยกรรม',      doctor: 'นพ.ทวีศักดิ์ สมาน',   purpose: 'ตรวจแผล', status: 'MISSED' },
        { d:-25, h: 10, m: 30, hospital: 'โรงพยาบาลนพรัตน์',      dept: 'ศัลยกรรม',      doctor: 'นพ.ทวีศักดิ์ สมาน',   purpose: 'ผ่าตัดเล็กไส้เลื่อน', status: 'COMPLETED' },
      ],
    },
    {
      elderlyIdx: 8, // บุษบา
      appts: [
        { d:  2, h: 10, m: 30, hospital: 'โรงพยาบาลสมเด็จ',       dept: 'ไต',             doctor: 'นพ.พิชัย โชคดี',       purpose: 'ตรวจการทำงานของไต', status: 'SCHEDULED' },
        { d: -4, h:  9, m:  0, hospital: 'โรงพยาบาลสมเด็จ',       dept: 'ไต',             doctor: 'นพ.พิชัย โชคดี',       purpose: 'ติดตามครีอะตินิน', status: 'MISSED' },
        { d:-16, h: 11, m:  0, hospital: 'โรงพยาบาลสมเด็จ',       dept: 'ไต',             doctor: 'นพ.พิชัย โชคดี',       purpose: 'ฟอกเลือด', status: 'COMPLETED' },
      ],
    },
    {
      elderlyIdx: 9, // ศิริวรรณ
      appts: [
        { d:  0, h: 14, m: 30, hospital: 'โรงพยาบาลวชิรพยาบาล',  dept: 'ประสาทวิทยา',  doctor: 'นพ.นวพล รัตนะ',        purpose: 'ติดตามพาร์กินสัน', status: 'SCHEDULED' },
        { d:  2, h: 10, m:  0, hospital: 'โรงพยาบาลวชิรพยาบาล',  dept: 'เวชศาสตร์ฟื้นฟู', doctor: 'พญ.อรทัย วิไล',    purpose: 'กายภาพบำบัด', status: 'SCHEDULED' },
        { d: -9, h: 13, m:  0, hospital: 'โรงพยาบาลวชิรพยาบาล',  dept: 'ประสาทวิทยา',  doctor: 'นพ.นวพล รัตนะ',        purpose: 'ปรับยาพาร์กินสัน', status: 'MISSED' },
        { d:-19, h: 10, m:  0, hospital: 'โรงพยาบาลวชิรพยาบาล',  dept: 'ประสาทวิทยา',  doctor: 'นพ.นวพล รัตนะ',        purpose: 'ตรวจประจำเดือน', status: 'COMPLETED' },
      ],
    },
  ];

  let apptCreated = 0;
  for (const row of apptData) {
    const elderly = seededElderly[row.elderlyIdx];
    if (!elderly) continue;
    for (const a of row.appts) {
      await prisma.appointment.create({
        data: {
          elderlyId:           elderly.id,
          hospitalName:        a.hospital,
          department:          a.dept,
          doctorName:          a.doctor,
          appointmentDatetime: daysFromNow(a.d, a.h, a.m),
          purpose:             a.purpose,
          status:              a.status,
        },
      });
      apptCreated++;
    }
  }
  console.log(`   ✅ เพิ่มนัดหมอ ${apptCreated} รายการ\n`);

  // ----------------------------------------------------------
  // Section 8: Seed Notifications
  // ----------------------------------------------------------
  console.log('📨 Section 8: Seeding notifications...');

  // Re-fetch elderly with phone numbers for recipients
  const elderlyForNotif = await prisma.elderly.findMany({
    where:   { organizationId: organization.id },
    orderBy: { createdAt: 'asc' },
    select:  { id: true, firstName: true, lastName: true, phone: true },
    take:    10,
  });

  function hoursAgo(h: number): Date {
    const d = new Date();
    d.setTime(d.getTime() - h * 3600 * 1000);
    return d;
  }

  // Templates: { channel, status, hoursBack, messageTemplate }
  type NotifTemplate = {
    channel:        'LINE' | 'SMS' | 'EMAIL' | 'VOICE_CALL';
    deliveryStatus: 'SENT' | 'FAILED' | 'PENDING' | 'READ';
    hoursBack:      number;
    subject?:       string;
    messageTemplate: (name: string) => string;
  };

  const NOTIF_TEMPLATES: NotifTemplate[] = [
    // LINE — SENT (medication reminders)
    { channel: 'LINE', deliveryStatus: 'SENT',    hoursBack: 1,    messageTemplate: n => `สวัสดีค่ะ คุณ${n} ถึงเวลากินยาเบาหวานแล้วนะคะ อย่าลืมด้วยนะคะ 💊` },
    { channel: 'LINE', deliveryStatus: 'SENT',    hoursBack: 3,    messageTemplate: n => `คุณ${n} ได้เวลากินยาความดันโลหิตแล้วค่ะ กรุณากินยาให้ตรงเวลาด้วยนะคะ` },
    { channel: 'LINE', deliveryStatus: 'READ',    hoursBack: 5,    messageTemplate: n => `แจ้งเตือน: คุณ${n} มีนัดพบแพทย์พรุ่งนี้เวลา 09:00 น. ที่โรงพยาบาลรามาธิบดี 🏥` },
    { channel: 'LINE', deliveryStatus: 'SENT',    hoursBack: 8,    messageTemplate: n => `สวัสดีค่ะ คุณ${n} AI ชื่นใจโทรเช็กสุขภาพแล้วค่ะ วันนี้สบายดีไหมคะ?` },
    { channel: 'LINE', deliveryStatus: 'SENT',    hoursBack: 12,   messageTemplate: n => `คุณ${n} อย่าลืมกินยาก่อนนอนด้วยนะคะ ดูแลสุขภาพด้วยนะคะ 🌙` },
    { channel: 'LINE', deliveryStatus: 'READ',    hoursBack: 24,   messageTemplate: n => `แจ้งเตือนด่วน: AI ชื่นใจตรวจพบว่าคุณ${n}ไม่ได้กินยามา 2 วันแล้วค่ะ กรุณาติดต่อผู้ดูแล` },
    { channel: 'LINE', deliveryStatus: 'SENT',    hoursBack: 28,   messageTemplate: n => `คุณ${n} ยาที่คุณกินได้รับการบันทึกเรียบร้อยแล้วค่ะ ขอบคุณนะคะ ✅` },
    { channel: 'LINE', deliveryStatus: 'SENT',    hoursBack: 36,   messageTemplate: n => `สวัสดีตอนเช้าค่ะ คุณ${n} อย่าลืมกินยาเช้าด้วยนะคะ` },
    { channel: 'LINE', deliveryStatus: 'SENT',    hoursBack: 42,   messageTemplate: n => `คุณ${n} ระบบ AI ชื่นใจได้โทรหาแล้วแต่ไม่มีสัญญาณ กรุณาตรวจสอบโทรศัพท์ด้วยค่ะ` },
    { channel: 'LINE', deliveryStatus: 'SENT',    hoursBack: 48,   messageTemplate: n => `แจ้งเตือน: คุณ${n} ขอให้ทานยาสม่ำเสมอนะคะ สุขภาพดีขึ้นแน่นอนค่ะ 💚` },
    { channel: 'LINE', deliveryStatus: 'READ',    hoursBack: 56,   messageTemplate: n => `คุณ${n} ผู้ดูแลของคุณได้รับแจ้งเตือนเรื่องสุขภาพของท่านแล้วนะคะ` },
    { channel: 'LINE', deliveryStatus: 'SENT',    hoursBack: 63,   messageTemplate: n => `สวัสดีค่ะ คุณ${n} ครบกำหนดตรวจน้ำตาลในเลือดแล้วนะคะ 🩸` },
    { channel: 'LINE', deliveryStatus: 'SENT',    hoursBack: 72,   messageTemplate: n => `คุณ${n} AI ชื่นใจฝากให้กำลังใจนะคะ ดูแลสุขภาพด้วยนะคะ 🌺` },
    { channel: 'LINE', deliveryStatus: 'SENT',    hoursBack: 84,   messageTemplate: n => `แจ้งเตือน: คุณ${n} มียา Metformin ที่ต้องกินค้างอยู่ กรุณากินทันทีค่ะ` },
    { channel: 'LINE', deliveryStatus: 'READ',    hoursBack: 96,   messageTemplate: n => `คุณ${n} ขอแสดงความห่วงใย ถ้ารู้สึกไม่สบายให้โทรแจ้งผู้ดูแลเลยนะคะ 📞` },
    // LINE — FAILED
    { channel: 'LINE', deliveryStatus: 'FAILED',  hoursBack: 2,    messageTemplate: n => `คุณ${n} ถึงเวลากินยาแล้วค่ะ ระวังอย่าลืมนะคะ` },
    { channel: 'LINE', deliveryStatus: 'FAILED',  hoursBack: 20,   messageTemplate: n => `แจ้งเตือน: คุณ${n} ขาดนัดพบแพทย์เมื่อวานนี้ กรุณาติดต่อโรงพยาบาลเพื่อนัดใหม่ค่ะ` },
    { channel: 'LINE', deliveryStatus: 'FAILED',  hoursBack: 50,   messageTemplate: n => `คุณ${n} ระบบตรวจพบว่าคุณอาจมีความเสี่ยงสูง กรุณาติดต่อผู้ดูแลด่วนค่ะ` },
    // LINE — PENDING
    { channel: 'LINE', deliveryStatus: 'PENDING', hoursBack: 0.1,  messageTemplate: n => `คุณ${n} กำลังส่งข้อความแจ้งเตือนยาค่ะ...` },
    { channel: 'LINE', deliveryStatus: 'PENDING', hoursBack: 0.05, messageTemplate: n => `สวัสดีค่ะ คุณ${n} ถึงเวลาเช็กสุขภาพแล้วค่ะ` },
    // SMS — SENT
    { channel: 'SMS',  deliveryStatus: 'SENT',    hoursBack: 2,    subject: 'แจ้งเตือนยา', messageTemplate: n => `[ชื่นใจAI] คุณ${n} ถึงเวลากินยาแล้วค่ะ` },
    { channel: 'SMS',  deliveryStatus: 'SENT',    hoursBack: 6,    subject: 'นัดแพทย์',    messageTemplate: n => `[ชื่นใจAI] แจ้งเตือน คุณ${n} มีนัดพรุ่งนี้ 10:00 น. รพ.จุฬาฯ` },
    { channel: 'SMS',  deliveryStatus: 'READ',    hoursBack: 10,   subject: 'แจ้งเตือน',   messageTemplate: n => `[ชื่นใจAI] คุณ${n} ระบบ AI ตรวจพบความเสี่ยงสูง กรุณาติดต่อผู้ดูแล` },
    { channel: 'SMS',  deliveryStatus: 'SENT',    hoursBack: 18,   subject: 'ยาประจำวัน',  messageTemplate: n => `[ชื่นใจAI] สวัสดีตอนเช้า คุณ${n} อย่าลืมยาเช้านะคะ` },
    { channel: 'SMS',  deliveryStatus: 'SENT',    hoursBack: 26,   subject: 'แจ้งเตือน',   messageTemplate: n => `[ชื่นใจAI] คุณ${n} ยา Aspirin เวลาเช้า 1 เม็ด` },
    { channel: 'SMS',  deliveryStatus: 'SENT',    hoursBack: 32,   subject: 'ยา',           messageTemplate: n => `[ชื่นใจAI] คุณ${n} อย่าลืมยาก่อนนอนนะคะ` },
    { channel: 'SMS',  deliveryStatus: 'SENT',    hoursBack: 44,   subject: 'แจ้งเตือน',   messageTemplate: n => `[ชื่นใจAI] คุณ${n} ขาดยา 1 มื้อ กรุณากินทดแทนได้เลยค่ะ` },
    { channel: 'SMS',  deliveryStatus: 'SENT',    hoursBack: 52,   subject: 'ยาประจำวัน',  messageTemplate: n => `[ชื่นใจAI] สวัสดีตอนเช้า คุณ${n} วันนี้ต้องกินยา 3 ชนิดนะคะ` },
    { channel: 'SMS',  deliveryStatus: 'SENT',    hoursBack: 60,   subject: 'แจ้งเตือน',   messageTemplate: n => `[ชื่นใจAI] คุณ${n} ครบกำหนดรับยาประจำเดือนแล้วค่ะ` },
    { channel: 'SMS',  deliveryStatus: 'SENT',    hoursBack: 70,   subject: 'นัดแพทย์',    messageTemplate: n => `[ชื่นใจAI] คุณ${n} มีนัดพรุ่งนี้ 14:00 น. โปรดไปตามนัด` },
    // SMS — FAILED
    { channel: 'SMS',  deliveryStatus: 'FAILED',  hoursBack: 4,    subject: 'ยา',           messageTemplate: n => `[ชื่นใจAI] คุณ${n} กินยาเย็นด้วยนะคะ` },
    { channel: 'SMS',  deliveryStatus: 'FAILED',  hoursBack: 15,   subject: 'แจ้งเตือน',   messageTemplate: n => `[ชื่นใจAI] คุณ${n} ระบบตรวจพบการขาดยา 3 วันติดต่อกัน` },
    { channel: 'SMS',  deliveryStatus: 'FAILED',  hoursBack: 38,   subject: 'ด่วน',         messageTemplate: n => `[ชื่นใจAI] URGENT: คุณ${n} ผู้ดูแลต้องการให้ติดต่อกลับด่วน` },
    // SMS — PENDING
    { channel: 'SMS',  deliveryStatus: 'PENDING', hoursBack: 0.08, subject: 'ยา',           messageTemplate: n => `[ชื่นใจAI] คุณ${n} ถึงเวลากินยาเช้าแล้วค่ะ` },
    // EMAIL — SENT
    { channel: 'EMAIL', deliveryStatus: 'SENT',   hoursBack: 16,   subject: 'รายงานสุขภาพ', messageTemplate: n => `เรียน คุณ${n} นี่คือรายงานสุขภาพรายสัปดาห์จากระบบ AI ชื่นใจค่ะ` },
    { channel: 'EMAIL', deliveryStatus: 'SENT',   hoursBack: 48,   subject: 'แจ้งเตือนนัด', messageTemplate: n => `เรียน คุณ${n} ขอแจ้งให้ทราบว่ามีนัดพบแพทย์ในสัปดาห์นี้ค่ะ` },
  ];

  let notifCreated = 0;
  const elderlyForNotifList = elderlyForNotif.filter(e => e);

  for (let t = 0; t < NOTIF_TEMPLATES.length; t++) {
    const tmpl   = NOTIF_TEMPLATES[t];
    const elderly = elderlyForNotifList[t % elderlyForNotifList.length];
    if (!elderly) continue;

    const name      = elderly.firstName ?? 'คุณ';
    const recipient = tmpl.channel === 'LINE'
      ? (`U${elderly.id.toString().padStart(32, '0')}`.slice(0, 33))   // mock LINE UID
      : tmpl.channel === 'EMAIL'
        ? `${name.toLowerCase()}@example.com`
        : (elderly.phone ?? '0800000000');

    const createdAt = hoursAgo(tmpl.hoursBack);
    const sentAt    = tmpl.deliveryStatus === 'SENT' || tmpl.deliveryStatus === 'READ'
      ? new Date(createdAt.getTime() + Math.random() * 5000 + 1000)
      : null;

    await prisma.notification.create({
      data: {
        elderlyId:      elderly.id,
        channel:        tmpl.channel,
        recipient,
        subject:        tmpl.subject ?? null,
        message:        tmpl.messageTemplate(name),
        deliveryStatus: tmpl.deliveryStatus,
        sentAt,
        createdAt,
      },
    });
    notifCreated++;
  }
  console.log(`   ✅ เพิ่ม Notification ${notifCreated} รายการ\n`);

  // ----------------------------------------------------------
  // Summary
  // ----------------------------------------------------------
  console.log('─'.repeat(50));
  console.log('✅ Seed completed successfully!\n');
  console.log('📋 Summary:');
  console.log(`   Organization : ${organization.organizationName}`);
  console.log(`   Super Admin  : username=superadmin  password=${rawPassword}`);
  console.log(`   Demo Staff   : password=Demo@1234!`);
  console.log(`   Permissions  : ${permissions.length} rows`);
  console.log(`   Settings     : ${settings.length} keys`);
  console.log(`   Elderly      : ${elderlyCreated} profiles created`);
  console.log('─'.repeat(50));
  console.log('\n⚠️  Change the Super Admin password immediately in production!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
