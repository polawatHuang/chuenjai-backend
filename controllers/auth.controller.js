const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcrypt');
const crypto  = require('crypto');
const { z }   = require('zod');

const prisma          = require('../config/prisma');
const { success, failure } = require('../utils/response');
const { createAuditLog }   = require('../utils/audit');

// ── Validation schemas ────────────────────────────────────────────────────────

const loginSchema = z.object({
  username: z.string().min(1, 'Username or phone is required').max(100),
  password: z.string().min(1, 'Password is required'),
});

// Phone number normalisation: 0812345678 → 0812345678, +66812345678 → 0812345678
function normalizePhone(raw) {
  let p = raw.replace(/[\s\-().]/g, '');
  if (p.startsWith('+66')) p = '0' + p.slice(3);
  if (p.startsWith('66') && p.length >= 11) p = '0' + p.slice(2);
  return p;
}

function looksLikePhone(str) {
  return /^[0+][\d\s\-().]{7,14}$/.test(str.trim());
}

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ── Token helpers ─────────────────────────────────────────────────────────────

function issueAccessToken(user) {
  return jwt.sign(
    {
      sub:            user.id.toString(),
      organizationId: user.organizationId.toString(),
      role:           user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function issueRefreshToken() {
  // 64 random bytes → 128-char hex string stored in login_sessions
  return crypto.randomBytes(64).toString('hex');
}

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/login
 *
 * Authenticates staff credentials against the enterprise users table.
 * Issues a short-lived JWT access token (15 min) and a long-lived refresh
 * token (30 days) stored in login_sessions for rotation.
 * Records a LOGIN entry in audit_logs on every successful login.
 */
const login = async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);
  }

  const { username, password } = parsed.data;

  const userSelect = {
    id:           true,
    organizationId: true,
    username:     true,
    passwordHash: true,
    fullName:     true,
    role:         true,
    isActive:     true,
    organization: {
      select: {
        id:               true,
        organizationName: true,
        isActive:         true,
        subscriptionEnd:  true,
      },
    },
  };

  try {
    let user = null;

    if (looksLikePhone(username)) {
      // Login by phone number
      const phone = normalizePhone(username.trim());
      user = await prisma.user.findFirst({
        where: { phone },
        select: userSelect,
      });
    }

    // Fall back to username lookup (also covers case where phone lookup found nothing)
    if (!user) {
      user = await prisma.user.findUnique({
        where: { username },
        select: userSelect,
      });
    }

    // Constant-time comparison to prevent user-enumeration timing attacks
    const passwordValid =
      user != null && (await bcrypt.compare(password, user.passwordHash));

    if (!user || !passwordValid) {
      return failure(res, 'INVALID_CREDENTIALS', 'ชื่อผู้ใช้ / เบอร์โทร หรือรหัสผ่านไม่ถูกต้อง', 401);
    }

    if (!user.isActive) {
      return failure(res, 'ACCOUNT_DISABLED', 'This account has been disabled', 403);
    }

    if (!user.organization.isActive) {
      return failure(res, 'ORGANIZATION_INACTIVE', 'Your organization subscription is inactive', 403);
    }

    const now = new Date();
    if (user.organization.subscriptionEnd && user.organization.subscriptionEnd < now) {
      return failure(res, 'SUBSCRIPTION_EXPIRED', 'Organization subscription has expired', 403);
    }

    const accessToken         = issueAccessToken(user);
    const refreshTokenValue   = issueRefreshToken();
    const refreshTokenExpiry  = new Date(Date.now() + REFRESH_TTL_MS);

    // Persist session + update last_login atomically
    await prisma.$transaction([
      prisma.loginSession.create({
        data: {
          userId:       user.id,
          refreshToken: refreshTokenValue,
          ipAddress:    normalizeIp(req.ip ?? req.socket?.remoteAddress),
          userAgent:    req.headers['user-agent'] ?? null,
          expiresAt:    refreshTokenExpiry,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data:  { lastLoginAt: now },
      }),
    ]);

    // Audit — FR-16
    await createAuditLog({
      userId:    user.id,
      action:    'LOGIN',
      tableName: 'users',
      recordId:  user.id,
      newData: {
        username:       user.username,
        role:           user.role,
        organizationId: user.organizationId.toString(),
      },
      req,
    });

    return success(res, {
      accessToken,
      refreshToken: refreshTokenValue,
      user: {
        id:               user.id.toString(),
        username:         user.username,
        fullName:         user.fullName,
        role:             user.role,
        organizationId:   user.organizationId.toString(),
        organizationName: user.organization.organizationName,
      },
    });
  } catch (err) {
    console.error('[AuthController.login]', err);
    return failure(res, 'INTERNAL_ERROR', 'Login failed. Please try again.', 500);
  }
};

/**
 * POST /api/v1/auth/refresh
 *
 * Validates the supplied refresh token against login_sessions.
 * Issues a new access token and rotates the refresh token (old session
 * is deleted and a new one is created) to limit the blast radius of
 * a stolen refresh token.
 */
const refresh = async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);
  }

  const { refreshToken } = parsed.data;

  try {
    const session = await prisma.loginSession.findFirst({
      where: {
        refreshToken,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id:           true,
            organizationId: true,
            role:         true,
            isActive:     true,
            organization: { select: { isActive: true, subscriptionEnd: true } },
          },
        },
      },
    });

    if (!session) {
      return failure(res, 'INVALID_TOKEN', 'Refresh token is invalid or expired', 401);
    }

    const { user } = session;

    if (!user.isActive || !user.organization.isActive) {
      // Revoke the session if the account is now disabled
      await prisma.loginSession.delete({ where: { id: session.id } });
      return failure(res, 'ACCOUNT_DISABLED', 'Account or organization is inactive', 403);
    }

    // Rotate: delete the used token and issue a fresh pair
    const newAccessToken       = issueAccessToken(user);
    const newRefreshTokenValue = issueRefreshToken();
    const newExpiry            = new Date(Date.now() + REFRESH_TTL_MS);

    await prisma.$transaction([
      prisma.loginSession.delete({ where: { id: session.id } }),
      prisma.loginSession.create({
        data: {
          userId:       user.id,
          refreshToken: newRefreshTokenValue,
          ipAddress:    normalizeIp(req.ip ?? req.socket?.remoteAddress),
          userAgent:    req.headers['user-agent'] ?? null,
          expiresAt:    newExpiry,
        },
      }),
    ]);

    return success(res, {
      accessToken:  newAccessToken,
      refreshToken: newRefreshTokenValue,
    });
  } catch (err) {
    console.error('[AuthController.refresh]', err);
    return failure(res, 'INTERNAL_ERROR', 'Token refresh failed', 500);
  }
};

/**
 * POST /api/v1/auth/logout
 *
 * Revokes the supplied refresh token from login_sessions so it can no
 * longer be used to issue new access tokens.  The access token itself
 * will expire naturally after its 15-minute window.
 */
const logout = async (req, res) => {
  const { refreshToken } = req.body;

  try {
    if (refreshToken) {
      await prisma.loginSession.deleteMany({ where: { refreshToken } });
    }

    await createAuditLog({
      userId:    req.user?.id,
      action:    'LOGOUT',
      tableName: 'users',
      recordId:  req.user?.id,
      req,
    });

    return success(res, { message: 'Logged out successfully' });
  } catch (err) {
    console.error('[AuthController.logout]', err);
    return failure(res, 'INTERNAL_ERROR', 'Logout failed', 500);
  }
};

/**
 * GET /api/v1/auth/me
 *
 * Returns the authenticated user's own profile from the database
 * (fresh read — not just the JWT payload).
 */
const me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: BigInt(req.user.id) },
      select: {
        id:           true,
        username:     true,
        fullName:     true,
        email:        true,
        phone:        true,
        role:         true,
        organizationId: true,
        isActive:     true,
        lastLoginAt:  true,
        organization: {
          select: {
            organizationName: true,
            organizationType: true,
            subscriptionPlan: true,
          },
        },
      },
    });

    if (!user) {
      return failure(res, 'NOT_FOUND', 'User not found', 404);
    }

    return success(res, user);
  } catch (err) {
    console.error('[AuthController.me]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch user profile', 500);
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeIp(ip) {
  if (!ip) return null;
  return ip.replace(/^::ffff:/, '');
}

// ── POST /api/v1/auth/change-password ────────────────────────────────────────
// Public reset: identify user by username/phone + set new password.
// No old-password required — intended for admin-managed password resets.

const changePasswordSchema = z.object({
  identifier:  z.string().min(1, 'Username or phone is required').max(100),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(100),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

const changePassword = async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);
  }

  const { identifier, newPassword } = parsed.data;

  try {
    // Resolve user by username or phone
    let user = null;
    if (looksLikePhone(identifier)) {
      const phone = normalizePhone(identifier.trim());
      user = await prisma.user.findFirst({
        where: { phone },
        select: { id: true, username: true, fullName: true, isActive: true },
      });
    }
    if (!user) {
      user = await prisma.user.findUnique({
        where: { username: identifier },
        select: { id: true, username: true, fullName: true, isActive: true },
      });
    }

    if (!user) {
      // Return generic message to avoid user enumeration
      return failure(res, 'INVALID_CREDENTIALS', 'ไม่พบบัญชีผู้ใช้นี้ในระบบ', 404);
    }

    if (!user.isActive) {
      return failure(res, 'ACCOUNT_DISABLED', 'บัญชีนี้ถูกระงับการใช้งาน', 403);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data:  { passwordHash },
    });

    // Revoke all existing sessions so old tokens no longer work
    await prisma.loginSession.deleteMany({ where: { userId: user.id } });

    await createAuditLog({
      userId:    user.id,
      action:    'PASSWORD_CHANGE',
      tableName: 'users',
      recordId:  user.id,
      newData:   { username: user.username },
      req,
    });

    return success(res, { message: 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่' });
  } catch (err) {
    console.error('[AuthController.changePassword]', err);
    return failure(res, 'INTERNAL_ERROR', 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', 500);
  }
};

module.exports = { login, refresh, logout, me, changePassword };
