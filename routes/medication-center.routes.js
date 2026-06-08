const { Router } = require('express');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { summary } = require('../controllers/medication-center.controller');

const router = Router();

router.get('/summary',
  authenticateToken, requirePermission('medications', 'view'), summary);

module.exports = router;
