const { Router } = require('express');
const { login, refresh, logout, me, changePassword } = require('../controllers/auth.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = Router();

// Public — no token required
router.post('/login',           login);
router.post('/refresh',         refresh);
router.post('/change-password', changePassword);

// Protected — valid access token required
router.post('/logout', authenticateToken, logout);
router.get('/me',      authenticateToken, me);

module.exports = router;
