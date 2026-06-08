/**
 * Settings Controller — Organization profile, users, integrations, system settings
 *
 * GET    /settings/profile               — org profile + subscription
 * PATCH  /settings/profile               — update org profile
 * GET    /settings/system                — all system settings (key→value map)
 * PATCH  /settings/system                — batch upsert settings
 * GET    /settings/integrations          — all integrations (secrets masked)
 * PUT    /settings/integrations/:type    — upsert integration config
 * DELETE /settings/integrations/:type    — deactivate integration
 * GET    /settings/users                 — paginated org users
 * POST   /settings/users                 — create user
 * PATCH  /settings/users/:id             — update user fields
 * POST   /settings/users/:id/reset-password — reset user password
 * PATCH  /settings/users/:id/toggle      — toggle isActive
 * DELETE /settings/users/:id             — delete user
 * GET    /settings/permissions           — full RBAC matrix
 */

const prisma  = require('../config/prisma');
const bcrypt  = require('bcrypt');

// ── Sensitive field masking ───────────────────────────────────────────────────

const MASKED_TOKEN = '••••••••';

function maskSecret(v) {
  if (!v) return '';
  if (v.length <= 8) return MASKED_TOKEN;
  return v.slice(0, 4) + '•'.repeat(8) + v.slice(-4);
}

function isMasked(v) {
  return !v || v.includes('•');
}

// Fields in each integration config that should be masked
const SENSITIVE_KEYS = new Set([
  'channelAccessToken', 'channelSecret',
  'authToken', 'accountSid',
  'apiKey', 'apiSecret',
  'pass', 'password', 'dbPassword',
  'secretKey',
]);

function maskConfig(config) {
  if (!config || typeof config !== 'object') return config;
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) => [
      k,
      SENSITIVE_KEYS.has(k) && typeof v === 'string' ? maskSecret(v) : v,
    ]),
  );
}

// When saving, merge new values (skip fields that are still masked)
function mergeConfig(existing, incoming) {
  if (!incoming || typeof incoming !== 'object') return incoming;
  const merged = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(incoming)) {
    if (typeof v === 'string' && isMasked(v)) continue; // skip masked placeholders
    merged[k] = v;
  }
  return merged;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function serializeOrg(o) {
  return {
    id:                o.id.toString(),
    code:              o.code,
    organizationName:  o.organizationName,
    organizationType:  o.organizationType,
    taxId:             o.taxId,
    phone:             o.phone,
    email:             o.email,
    address:           o.address,
    province:          o.province,
    district:          o.district,
    logoUrl:           o.logoUrl,
    subscriptionPlan:  o.subscriptionPlan,
    subscriptionStart: o.subscriptionStart,
    subscriptionEnd:   o.subscriptionEnd,
    isActive:          o.isActive,
    createdAt:         o.createdAt,
    updatedAt:         o.updatedAt,
  };
}

function serializeUser(u) {
  return {
    id:          u.id.toString(),
    username:    u.username,
    fullName:    u.fullName,
    email:       u.email,
    phone:       u.phone,
    role:        u.role,
    isActive:    u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt:   u.createdAt,
  };
}

// ── PROFILE ───────────────────────────────────────────────────────────────────

async function getProfile(req, res) {
  try {
    const orgId = BigInt(req.user.organizationId);
    const org   = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return res.status(404).json({ success: false, message: 'Organization not found' });
    return res.json({ success: true, data: serializeOrg(org) });
  } catch (err) {
    console.error('[Settings] getProfile:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function updateProfile(req, res) {
  try {
    const orgId  = BigInt(req.user.organizationId);
    const {
      organizationName, organizationType, taxId,
      phone, email, address, province, district, logoUrl,
    } = req.body;

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(organizationName !== undefined && { organizationName }),
        ...(organizationType !== undefined && { organizationType }),
        ...(taxId            !== undefined && { taxId            }),
        ...(phone            !== undefined && { phone            }),
        ...(email            !== undefined && { email            }),
        ...(address          !== undefined && { address          }),
        ...(province         !== undefined && { province         }),
        ...(district         !== undefined && { district         }),
        ...(logoUrl          !== undefined && { logoUrl          }),
      },
    });

    return res.json({ success: true, data: serializeOrg(updated) });
  } catch (err) {
    console.error('[Settings] updateProfile:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// ── SYSTEM SETTINGS ───────────────────────────────────────────────────────────

async function getSystemSettings(req, res) {
  try {
    const orgId = BigInt(req.user.organizationId);
    const rows  = await prisma.systemSetting.findMany({ where: { organizationId: orgId } });
    const map   = Object.fromEntries(rows.map(r => [r.settingKey, r.settingValue]));
    return res.json({ success: true, data: map });
  } catch (err) {
    console.error('[Settings] getSystemSettings:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function updateSystemSettings(req, res) {
  try {
    const orgId    = BigInt(req.user.organizationId);
    const settings = req.body; // { key: value, ... }

    const ops = Object.entries(settings).map(([key, value]) =>
      prisma.systemSetting.upsert({
        where:  { organizationId_settingKey: { organizationId: orgId, settingKey: key } },
        create: { organizationId: orgId, settingKey: key, settingValue: value },
        update: { settingValue: value },
      }),
    );

    await Promise.all(ops);
    const rows = await prisma.systemSetting.findMany({ where: { organizationId: orgId } });
    const map  = Object.fromEntries(rows.map(r => [r.settingKey, r.settingValue]));
    return res.json({ success: true, data: map });
  } catch (err) {
    console.error('[Settings] updateSystemSettings:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// ── INTEGRATIONS ──────────────────────────────────────────────────────────────

async function getIntegrations(req, res) {
  try {
    const orgId = BigInt(req.user.organizationId);
    const rows  = await prisma.integration.findMany({ where: { organizationId: orgId } });
    const data  = rows.map(r => ({
      id:              r.id.toString(),
      integrationType: r.integrationType,
      configuration:   maskConfig(r.configuration),
      isActive:        r.isActive,
      createdAt:       r.createdAt,
    }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[Settings] getIntegrations:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function upsertIntegration(req, res) {
  try {
    const orgId    = BigInt(req.user.organizationId);
    const type     = req.params.type?.toUpperCase();
    const { configuration, isActive } = req.body;

    const VALID_TYPES = ['LINE', 'SMS', 'HOSXP', 'JHCIS', 'FHIR'];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: `Invalid integration type: ${type}` });
    }

    // Load existing to merge (preserve secrets when masked)
    const existing = await prisma.integration.findFirst({
      where: { organizationId: orgId, integrationType: type },
    });

    const mergedConfig = configuration !== undefined
      ? mergeConfig(existing?.configuration, configuration)
      : existing?.configuration;

    let record;
    if (existing) {
      record = await prisma.integration.update({
        where: { id: existing.id },
        data: {
          ...(mergedConfig !== undefined && { configuration: mergedConfig }),
          ...(isActive     !== undefined && { isActive }),
        },
      });
    } else {
      record = await prisma.integration.create({
        data: {
          organizationId: orgId,
          integrationType: type,
          configuration: mergedConfig ?? {},
          isActive: isActive ?? true,
        },
      });
    }

    return res.json({
      success: true,
      data: {
        id:              record.id.toString(),
        integrationType: record.integrationType,
        configuration:   maskConfig(record.configuration),
        isActive:        record.isActive,
        createdAt:       record.createdAt,
      },
    });
  } catch (err) {
    console.error('[Settings] upsertIntegration:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function deleteIntegration(req, res) {
  try {
    const orgId = BigInt(req.user.organizationId);
    const type  = req.params.type?.toUpperCase();
    const row   = await prisma.integration.findFirst({
      where: { organizationId: orgId, integrationType: type },
    });
    if (!row) return res.status(404).json({ success: false, message: 'Integration not found' });
    await prisma.integration.update({ where: { id: row.id }, data: { isActive: false } });
    return res.json({ success: true, data: { integrationType: type, isActive: false } });
  } catch (err) {
    console.error('[Settings] deleteIntegration:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// ── USERS ─────────────────────────────────────────────────────────────────────

async function getUsers(req, res) {
  try {
    const orgId   = BigInt(req.user.organizationId);
    const page    = Math.max(1, parseInt(req.query.page ?? '1', 10));
    const limit   = Math.min(100, parseInt(req.query.limit ?? '20', 10));
    const search  = req.query.search ?? '';
    const skip    = (page - 1) * limit;

    const where = {
      organizationId: orgId,
      ...(search ? {
        OR: [
          { username: { contains: search } },
          { fullName: { contains: search } },
          { email:    { contains: search } },
        ],
      } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }], skip, take: limit }),
      prisma.user.count({ where }),
    ]);

    return res.json({
      success: true,
      data:    rows.map(serializeUser),
      meta:    { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[Settings] getUsers:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function createUser(req, res) {
  try {
    const orgId = BigInt(req.user.organizationId);
    const { username, password, fullName, email, phone, role } = req.body;

    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ success: false, message: 'username, password, fullName, role are required' });
    }

    const VALID_ROLES = ['ADMIN', 'SUPERVISOR', 'OFFICER', 'NURSE', 'VIEWER'];
    // SUPER_ADMIN cannot be created via API
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role: ${role}` });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(409).json({ success: false, message: 'Username already taken' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user         = await prisma.user.create({
      data: { organizationId: orgId, username, passwordHash, fullName, email, phone, role },
    });

    return res.status(201).json({ success: true, data: serializeUser(user) });
  } catch (err) {
    console.error('[Settings] createUser:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function updateUser(req, res) {
  try {
    const orgId  = BigInt(req.user.organizationId);
    const userId = BigInt(req.params.id);
    const { fullName, email, phone, role } = req.body;

    const existing = await prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
    if (!existing) return res.status(404).json({ success: false, message: 'User not found' });

    // Prevent demoting the last SUPER_ADMIN
    if (existing.role === 'SUPER_ADMIN' && role && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Cannot change SUPER_ADMIN role via settings' });
    }

    const VALID_ROLES = ['ADMIN', 'SUPERVISOR', 'OFFICER', 'NURSE', 'VIEWER'];
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role: ${role}` });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(email    !== undefined && { email    }),
        ...(phone    !== undefined && { phone    }),
        ...(role     !== undefined && { role     }),
      },
    });

    return res.json({ success: true, data: serializeUser(updated) });
  } catch (err) {
    console.error('[Settings] updateUser:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function resetUserPassword(req, res) {
  try {
    const orgId  = BigInt(req.user.organizationId);
    const userId = BigInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'newPassword must be at least 8 characters' });
    }

    const existing = await prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
    if (!existing) return res.status(404).json({ success: false, message: 'User not found' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    return res.json({ success: true, data: { message: 'Password reset successfully' } });
  } catch (err) {
    console.error('[Settings] resetUserPassword:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function toggleUserActive(req, res) {
  try {
    const orgId  = BigInt(req.user.organizationId);
    const userId = BigInt(req.params.id);

    const existing = await prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
    if (!existing) return res.status(404).json({ success: false, message: 'User not found' });

    // Prevent deactivating yourself
    if (userId === BigInt(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Cannot deactivate your own account' });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data:  { isActive: !existing.isActive },
    });

    return res.json({ success: true, data: serializeUser(updated) });
  } catch (err) {
    console.error('[Settings] toggleUserActive:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function deleteUser(req, res) {
  try {
    const orgId  = BigInt(req.user.organizationId);
    const userId = BigInt(req.params.id);

    if (userId === BigInt(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Cannot delete your own account' });
    }

    const existing = await prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
    if (!existing) return res.status(404).json({ success: false, message: 'User not found' });
    if (existing.role === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Cannot delete SUPER_ADMIN' });
    }

    await prisma.user.delete({ where: { id: userId } });
    return res.json({ success: true, data: { message: 'User deleted' } });
  } catch (err) {
    console.error('[Settings] deleteUser:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// ── PERMISSIONS ───────────────────────────────────────────────────────────────

async function getPermissions(req, res) {
  try {
    const rows = await prisma.rolePermission.findMany({ orderBy: [{ roleName: 'asc' }, { moduleName: 'asc' }] });
    return res.json({ success: true, data: rows.map(r => ({
      roleName:   r.roleName,
      moduleName: r.moduleName,
      canView:    r.canView,
      canCreate:  r.canCreate,
      canUpdate:  r.canUpdate,
      canDelete:  r.canDelete,
    })) });
  } catch (err) {
    console.error('[Settings] getPermissions:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = {
  getProfile, updateProfile,
  getSystemSettings, updateSystemSettings,
  getIntegrations, upsertIntegration, deleteIntegration,
  getUsers, createUser, updateUser, resetUserPassword, toggleUserActive, deleteUser,
  getPermissions,
};
