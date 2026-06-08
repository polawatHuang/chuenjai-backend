const router  = require('express').Router();
const { list, counts, officers, update } = require('../controllers/alert.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

router.use(authenticateToken);

router.get('/counts',   counts);
router.get('/officers', officers);
router.get('/',         list);
router.patch('/:id',    update);

module.exports = router;
