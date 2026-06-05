const { Router } = require('express');
const { login, refresh, logout, me } = require('../controllers/auth.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = Router();

// Public — no token required
router.post('/login',   login);
router.post('/refresh', refresh);

// Protected — valid access token required
router.post('/logout', authenticateToken, logout);
router.get('/me',      authenticateToken, me);

module.exports = router;
