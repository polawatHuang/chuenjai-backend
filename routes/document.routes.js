const express = require('express');
const multer  = require('multer');
const path    = require('path');
const router  = express.Router();
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const doc = require('../controllers/document.controller');
const pdf = require('../controllers/pdf-generator.controller');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── Documents ─────────────────────────────────────────────────────────────────
router.get('/',                authenticateToken, requirePermission('documents', 'view'),   doc.list);
router.post('/upload',         authenticateToken, requirePermission('documents', 'create'), upload.single('file'), doc.upload);
router.get('/:id/download',    authenticateToken, requirePermission('documents', 'view'),   doc.download);
router.post('/:id/parse',      authenticateToken, requirePermission('documents', 'update'), doc.parseLabWithAI);
router.delete('/:id',          authenticateToken, requirePermission('documents', 'delete'), doc.remove);

// ── PDF Generator ─────────────────────────────────────────────────────────────
router.post('/generate/prescription', authenticateToken, requirePermission('documents', 'create'), pdf.generatePrescription);
router.post('/generate/invoice',      authenticateToken, requirePermission('documents', 'create'), pdf.generateInvoice);

module.exports = router;
