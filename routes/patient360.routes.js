const express = require('express');
const router  = express.Router();
const c       = require('../controllers/patient360.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');

router.get('/:id/360', authenticateToken, requirePermission('lab-results', 'view'), c.getProfile360);

module.exports = router;
