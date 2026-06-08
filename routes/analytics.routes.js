const router = require('express').Router();
const { summary } = require('../controllers/analytics.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

router.use(authenticateToken);
router.get('/summary', summary);

module.exports = router;
