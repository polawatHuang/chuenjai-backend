const router = require('express').Router();
const { authenticateToken } = require('../middlewares/auth.middleware');
const c = require('../controllers/audit-log.controller');

const jwt = require('jsonwebtoken');

const auth = authenticateToken;
const adminOnly = (req, res, next) => {
  const role = req.user?.role;
  if (!role || !['SUPER_ADMIN', 'ADMIN'].includes(role)) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Admin access required' });
  }
  next();
};

// Allow token in query string for direct download links
const authOrQuery = (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    try {
      const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
      req.user = { id: decoded.sub, organizationId: decoded.organizationId, role: decoded.role };
      return next();
    } catch { /* fall through to normal auth */ }
  }
  return auth(req, res, next);
};

router.get('/summary', auth, adminOnly, c.summary);
router.get('/',        auth, adminOnly, c.list);
router.get('/export',  authOrQuery, adminOnly, c.exportCsv);

module.exports = router;
