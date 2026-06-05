const { Router } = require('express');
const { authenticateToken }  = require('../middlewares/auth.middleware');
const { requirePermission }  = require('../middlewares/rbac.middleware');
const upload = require('../middlewares/upload.middleware');
const {
  list, getById, create, update, remove, importExcel,
} = require('../controllers/elderly.controller');

const router = Router();

// IMPORTANT: /import must be declared before /:id so Express does not treat
// the literal string "import" as an ID parameter.
router.post(
  '/import',
  authenticateToken,
  requirePermission('elderlies', 'create'),
  (req, res, next) => {
    // Wrap multer error so it returns our standard JSON envelope
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          code:    err.code ?? 'UPLOAD_ERROR',
          message: err.message,
        });
      }
      next();
    });
  },
  importExcel
);

router.get('/',    authenticateToken, requirePermission('elderlies', 'view'),   list);
router.post('/',   authenticateToken, requirePermission('elderlies', 'create'), create);
router.get('/:id', authenticateToken, requirePermission('elderlies', 'view'),   getById);
router.put('/:id', authenticateToken, requirePermission('elderlies', 'update'), update);
router.delete('/:id', authenticateToken, requirePermission('elderlies', 'delete'), remove);

module.exports = router;
