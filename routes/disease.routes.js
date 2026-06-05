const { Router } = require('express');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { list, create, update, remove } = require('../controllers/disease.controller');

const router = Router();

router.get('/',    authenticateToken, requirePermission('diseases', 'view'),   list);
router.post('/',   authenticateToken, requirePermission('diseases', 'create'), create);
router.put('/:id', authenticateToken, requirePermission('diseases', 'update'), update);
router.delete('/:id', authenticateToken, requirePermission('diseases', 'delete'), remove);

module.exports = router;
