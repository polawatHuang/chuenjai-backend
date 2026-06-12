const express = require('express');
const router  = express.Router();
const c       = require('../controllers/formulation.controller');
const ing     = require('../controllers/ingredient.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');

// ── Ingredients catalog ───────────────────────────────────────────────────────
router.get('/ingredients',       authenticateToken, requirePermission('formulations', 'view'),   ing.list);
router.post('/ingredients',      authenticateToken, requirePermission('formulations', 'create'), ing.create);
router.put('/ingredients/:id',   authenticateToken, requirePermission('formulations', 'update'), ing.update);
router.delete('/ingredients/:id',authenticateToken, requirePermission('formulations', 'delete'), ing.remove);

// ── OEM Orders (must be before /:id to avoid route shadowing) ─────────────────
router.get('/oem-orders',           authenticateToken, requirePermission('formulations', 'view'),   c.listOemOrders);
router.get('/oem-orders/:id',       authenticateToken, requirePermission('formulations', 'view'),   c.getOemOrder);

// ── Formulations ──────────────────────────────────────────────────────────────
router.get('/',                     authenticateToken, requirePermission('formulations', 'view'),   c.list);
router.post('/',                    authenticateToken, requirePermission('formulations', 'create'), c.create);
router.get('/:id',                  authenticateToken, requirePermission('formulations', 'view'),   c.getById);
router.put('/:id',                  authenticateToken, requirePermission('formulations', 'update'), c.update);
router.post('/:id/ai-recommend',    authenticateToken, requirePermission('formulations', 'view'),   c.aiRecommend);
router.post('/:id/approve',         authenticateToken, requirePermission('formulations', 'update'), c.approve);
router.post('/:id/submit-oem',      authenticateToken, requirePermission('formulations', 'create'), c.submitToOem);

module.exports = router;
