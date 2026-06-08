const router = require('express').Router();
const { authenticateToken }  = require('../middlewares/auth.middleware');
const { requirePermission }  = require('../middlewares/rbac.middleware');
const c = require('../controllers/settings.controller');

const auth        = authenticateToken;
const adminOnly   = (req, res, next) => {
  const role = req.user?.role;
  if (!role || !['SUPER_ADMIN', 'ADMIN'].includes(role)) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Admin access required' });
  }
  next();
};

// Profile — any authenticated admin of this org
router.get('/profile',               auth, adminOnly, c.getProfile);
router.patch('/profile',             auth, adminOnly, c.updateProfile);

// System settings — admin only
router.get('/system',                auth, adminOnly, c.getSystemSettings);
router.patch('/system',              auth, adminOnly, c.updateSystemSettings);

// Integrations — admin only
router.get('/integrations',          auth, adminOnly, c.getIntegrations);
router.put('/integrations/:type',    auth, adminOnly, c.upsertIntegration);
router.delete('/integrations/:type', auth, adminOnly, c.deleteIntegration);

// Users — admin only
router.get('/users',                 auth, adminOnly, c.getUsers);
router.post('/users',                auth, adminOnly, c.createUser);
router.patch('/users/:id',           auth, adminOnly, c.updateUser);
router.post('/users/:id/reset-password', auth, adminOnly, c.resetUserPassword);
router.patch('/users/:id/toggle',    auth, adminOnly, c.toggleUserActive);
router.delete('/users/:id',          auth, adminOnly, c.deleteUser);

// Permissions matrix — any authenticated admin
router.get('/permissions',           auth, adminOnly, c.getPermissions);

module.exports = router;
