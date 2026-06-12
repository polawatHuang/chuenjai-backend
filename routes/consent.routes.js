const express = require('express');
const router  = express.Router();
const c       = require('../controllers/consent.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');

router.get('/',                        authenticateToken, requirePermission('consent', 'view'),   c.list);
router.post('/',                       authenticateToken, requirePermission('consent', 'create'), c.record);
router.get('/summary/:elderlyId',      authenticateToken, requirePermission('consent', 'view'),   c.getSummary);

module.exports = router;
