const express = require('express');
const router  = express.Router();
const c       = require('../controllers/appointment.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');

router.get('/summary', authenticateToken, requirePermission('appointments', 'view'), c.summary);
router.get('/',        authenticateToken, requirePermission('appointments', 'view'), c.list);
router.post('/',       authenticateToken, requirePermission('appointments', 'create'), c.create);
router.put('/:id',     authenticateToken, requirePermission('appointments', 'update'), c.update);
router.delete('/:id',  authenticateToken, requirePermission('appointments', 'delete'), c.remove);

module.exports = router;
