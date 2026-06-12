const express = require('express');
const router  = express.Router();
const c       = require('../controllers/messaging.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');

// ── Chat Routes ───────────────────────────────────────────────────────────────
router.get('/chat-routes',          authenticateToken, requirePermission('messaging', 'view'),   c.listChatRoutes);
router.post('/chat-routes',         authenticateToken, requirePermission('messaging', 'create'), c.createChatRoute);
router.put('/chat-routes/:id',      authenticateToken, requirePermission('messaging', 'update'), c.updateChatRoute);
router.delete('/chat-routes/:id',   authenticateToken, requirePermission('messaging', 'delete'), c.deleteChatRoute);

// ── Rich Menus ────────────────────────────────────────────────────────────────
router.get('/rich-menus',           authenticateToken, requirePermission('messaging', 'view'),   c.listRichMenus);
router.post('/rich-menus',          authenticateToken, requirePermission('messaging', 'create'), c.upsertRichMenu);
router.post('/rich-menus/:id/deploy', authenticateToken, requirePermission('messaging', 'update'), c.deployRichMenu);
router.delete('/rich-menus/:id',    authenticateToken, requirePermission('messaging', 'delete'), c.deleteRichMenu);

// ── Broadcast Campaigns ───────────────────────────────────────────────────────
router.get('/broadcasts',           authenticateToken, requirePermission('messaging', 'view'),   c.listBroadcasts);
router.post('/broadcasts',          authenticateToken, requirePermission('messaging', 'create'), c.createBroadcast);
router.put('/broadcasts/:id',       authenticateToken, requirePermission('messaging', 'update'), c.updateBroadcast);
router.post('/broadcasts/:id/send', authenticateToken, requirePermission('messaging', 'create'), c.sendBroadcast);
router.get('/broadcasts/:id/stats', authenticateToken, requirePermission('messaging', 'view'),   c.broadcastStats);

module.exports = router;
