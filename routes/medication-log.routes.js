const { Router } = require('express');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { list, create } = require('../controllers/medication-log.controller');

const router = Router();

router.get('/',  authenticateToken, requirePermission('medications', 'view'),   list);
router.post('/', authenticateToken, requirePermission('medications', 'create'), create);

module.exports = router;
