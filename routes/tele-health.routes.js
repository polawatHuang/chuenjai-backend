const express = require('express');
const router  = express.Router();
const c       = require('../controllers/tele-health.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');

router.get('/doctor-slots',        authenticateToken, requirePermission('tele-health', 'view'),   c.getDoctorSlots);
router.get('/consultations',       authenticateToken, requirePermission('tele-health', 'view'),   c.list);
router.post('/consultations',      authenticateToken, requirePermission('tele-health', 'create'), c.create);
router.get('/consultations/:id',   authenticateToken, requirePermission('tele-health', 'view'),   c.getById);
router.patch('/consultations/:id', authenticateToken, requirePermission('tele-health', 'update'), c.update);
router.post('/consultations/:id/start', authenticateToken, requirePermission('tele-health', 'update'), c.startSession);
router.post('/consultations/:id/end',   authenticateToken, requirePermission('tele-health', 'update'), c.endSession);

module.exports = router;
