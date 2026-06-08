const router = require('express').Router();
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const c = require('../controllers/report.controller');

const auth = authenticateToken;
const view = requirePermission('reports', 'view');

router.get('/summary',           auth, view, c.summary);
router.get('/preview',           auth, view, c.previewData);
router.get('/download/excel',    auth, view, c.downloadExcel);
router.get('/jobs',              auth, view, c.listJobs);

module.exports = router;
