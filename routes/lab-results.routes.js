const express = require('express');
const router  = express.Router();
const lab     = require('../controllers/lab-result.controller');
const allergy = require('../controllers/allergy.controller');
const lifestyle = require('../controllers/lifestyle-log.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');

// ── Lab Panels ────────────────────────────────────────────────────────────────
router.get('/panels',        authenticateToken, requirePermission('lab-results', 'view'),   lab.listPanels);
router.post('/panels',       authenticateToken, requirePermission('lab-results', 'create'), lab.createPanel);

// ── Lab Results ───────────────────────────────────────────────────────────────
router.get('/',              authenticateToken, requirePermission('lab-results', 'view'),   lab.list);
router.post('/',             authenticateToken, requirePermission('lab-results', 'create'), lab.create);
router.get('/:id',           authenticateToken, requirePermission('lab-results', 'view'),   lab.getById);
router.put('/:id',           authenticateToken, requirePermission('lab-results', 'update'), lab.update);
router.delete('/:id',        authenticateToken, requirePermission('lab-results', 'delete'), lab.remove);

// ── Allergies ─────────────────────────────────────────────────────────────────
router.get('/allergies',     authenticateToken, requirePermission('lab-results', 'view'),   allergy.list);
router.post('/allergies',    authenticateToken, requirePermission('lab-results', 'create'), allergy.create);
router.put('/allergies/:id', authenticateToken, requirePermission('lab-results', 'update'), allergy.update);
router.delete('/allergies/:id', authenticateToken, requirePermission('lab-results', 'delete'), allergy.remove);

// ── Lifestyle Logs ────────────────────────────────────────────────────────────
router.get('/lifestyle',     authenticateToken, requirePermission('lab-results', 'view'),   lifestyle.list);
router.post('/lifestyle',    authenticateToken, requirePermission('lab-results', 'create'), lifestyle.create);

module.exports = router;
