const { Router } = require('express');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { list, create, update, remove } = require('../controllers/caregiver.controller');

const router = Router();

router.get('/',       authenticateToken, requirePermission('elderlies', 'view'),   list);
router.post('/',      authenticateToken, requirePermission('elderlies', 'update'), create);
router.put('/:id',    authenticateToken, requirePermission('elderlies', 'update'), update);
router.delete('/:id', authenticateToken, requirePermission('elderlies', 'update'), remove);

module.exports = router;
