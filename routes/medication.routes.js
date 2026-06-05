const { Router } = require('express');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { list, create, update, remove } = require('../controllers/medication.controller');

const router = Router();

router.get('/',    authenticateToken, requirePermission('medications', 'view'),   list);
router.post('/',   authenticateToken, requirePermission('medications', 'create'), create);
router.put('/:id', authenticateToken, requirePermission('medications', 'update'), update);
router.delete('/:id', authenticateToken, requirePermission('medications', 'delete'), remove);

module.exports = router;
