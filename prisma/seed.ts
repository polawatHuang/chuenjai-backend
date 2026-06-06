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
