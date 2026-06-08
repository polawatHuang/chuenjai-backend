const router = require('express').Router();
const c = require('../controllers/call-center.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

router.use(authenticateToken);

router.get('/summary',  c.summary);
router.get('/call/:id', c.callDetail);

module.exports = router;
