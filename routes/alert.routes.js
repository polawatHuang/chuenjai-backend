const router  = require('express').Router();
const { list, update } = require('../controllers/alert.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

router.use(authenticateToken);

router.get('/',     list);
router.patch('/:id', update);

module.exports = router;
