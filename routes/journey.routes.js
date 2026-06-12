const express = require('express');
const router  = express.Router();
const c       = require('../controllers/journey.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');

router.get('/board',              authenticateToken, requirePermission('journey', 'view'),   c.getBoard);
router.get('/subscriptions',      authenticateToken, requirePermission('journey', 'view'),   c.listSubscriptions);
router.post('/subscriptions',     authenticateToken, requirePermission('journey', 'create'), c.createSubscription);
router.patch('/subscriptions/:id', authenticateToken, requirePermission('journey', 'update'), c.updateSubscription);
router.post('/subscriptions/:id/send-recall', authenticateToken, requirePermission('journey', 'update'), c.sendRecall);

module.exports = router;
