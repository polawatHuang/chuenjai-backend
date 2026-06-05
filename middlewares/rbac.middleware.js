const prisma = require('../config/prisma');
const { failure } = require('../utils/response');

/**
 * In-process permission cache.
 *
 * Key: "ROLE:MODULE"
 * Value: { canView, canCreate, canUpdate, canDelete, expiresAt }
 *
 * TTL: 5 minutes — matches the Redis cache TTL defined in the SDS cache design.
 * In production, replace with a Redis-backed cache via ioredis/BullMQ's connection
 * to avoid stale permissions persisting across multiple API server instances.
 */
const permissionCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function resolvePermissions(roleName, moduleName) {
  const key = `${roleName}:${moduleName}`;
  const cached = permissionCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const row = await prisma.rolePermission.findUnique({
    where: { roleName_moduleName: { roleName, moduleName } },
    select: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
  });

  if (row) {
    permissionCache.set(key, { ...row, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return row ?? null;
}

/**
 * Middleware factory — attach after authenticateToken on any protected route.
 *
 * Usage:
 *   router.get('/',  authenticateToken, requirePermission('elderlies', 'view'),   list)
 *   router.post('/', authenticateToken, requirePermission('elderlies', 'create'), create)
 *   router.put('/:id', authenticateToken, requirePermission('elderlies', 'update'), update)
 *   router.delete('/:id', authenticateToken, requirePermission('elderlies', 'delete'), remove)
 *
 * @param {string} moduleName  - matches role_permissions.module_name
 * @param {'view'|'create'|'update'|'delete'} action
 */
const requirePermission = (moduleName, action) => {
  const actionToField = {
    view:   'canView',
    create: 'canCreate',
    update: 'canUpdate',
    delete: 'canDelete',
  };

  if (!actionToField[action]) {
    throw new Error(`[RBAC] Unknown action "${action}". Must be view|create|update|delete.`);
  }

  return async (req, res, next) => {
    if (!req.user) {
      return failure(res, 'UNAUTHORIZED', 'Authentication required', 401);
    }

    const { role } = req.user;

    // SUPER_ADMIN has unrestricted platform-wide access
    if (role === 'SUPER_ADMIN') {
      return next();
    }

    try {
      const perms = await resolvePermissions(role, moduleName);

      if (!perms) {
        return failure(
          res,
          'FORBIDDEN',
          `No permissions defined for role "${role}" on module "${moduleName}"`,
          403
        );
      }

      if (!perms[actionToField[action]]) {
        return failure(
          res,
          'FORBIDDEN',
          `Role "${role}" cannot perform "${action}" on "${moduleName}"`,
          403
        );
      }

      next();
    } catch (err) {
      console.error('[RBACMiddleware]', err);
      return failure(res, 'INTERNAL_ERROR', 'Authorization check failed', 500);
    }
  };
};

/**
 * Enforces that req.user.organizationId matches the organization being accessed.
 * Use on routes that accept an :organizationId path param.
 * SUPER_ADMIN is exempt.
 */
const requireSameOrg = (req, res, next) => {
  if (!req.user) {
    return failure(res, 'UNAUTHORIZED', 'Authentication required', 401);
  }

  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  const paramOrgId = req.params.organizationId ?? req.query.organizationId;

  if (paramOrgId && paramOrgId !== req.user.organizationId) {
    return failure(res, 'FORBIDDEN', 'Cross-organization access is not permitted', 403);
  }

  next();
};

/**
 * Invalidate cache entries when role_permissions are updated.
 * Call with no args to flush all; call with role+module to flush one entry.
 */
function invalidatePermissionCache(roleName, moduleName) {
  if (roleName && moduleName) {
    permissionCache.delete(`${roleName}:${moduleName}`);
  } else {
    permissionCache.clear();
  }
}

module.exports = { requirePermission, requireSameOrg, invalidatePermissionCache };
