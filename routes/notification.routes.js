const router = require('express').Router();
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const c = require('../controllers/notification.controller');

const auth  = authenticateToken;
const view  = requirePermission('notifications', 'view');
const upd   = requirePermission('notifications', 'update');

router.get('/summary',        auth, view, c.summary);
router.get('/',               auth, view, c.list);
router.post('/:id/retry',     auth, upd,  c.retry);
router.post('/retry-all',     auth, upd,  c.retryAll);

module.exports = router;
