const express = require('express');
const router  = express.Router();
const c = require('../controllers/line-chat.controller');
const { authenticateToken }  = require('../middlewares/auth.middleware');
const { requirePermission }  = require('../middlewares/rbac.middleware');

router.get('/stats',                     authenticateToken, requirePermission('messaging', 'view'),   c.getStats);
router.get('/conversations',             authenticateToken, requirePermission('messaging', 'view'),   c.listConversations);
router.get('/conversations/:id/messages',authenticateToken, requirePermission('messaging', 'view'),   c.getMessages);
router.post('/conversations/:id/reply',  authenticateToken, requirePermission('messaging', 'create'), c.sendReply);
router.patch('/conversations/:id/status',authenticateToken, requirePermission('messaging', 'update'), c.updateStatus);

module.exports = router;
