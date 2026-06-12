const router = require('express').Router();
const c = require('../controllers/analytics.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

router.use(authenticateToken);
router.get('/summary',          c.summary);
router.get('/cohort-retention', c.cohortRetention);
router.get('/clv',              c.clv);
router.get('/revenue',          c.revenue);
router.get('/inventory',        c.inventory);

module.exports = router;
