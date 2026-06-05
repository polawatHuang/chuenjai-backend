const multer = require('multer');

const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                           // .xls
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap
  fileFilter: (_req, file, cb) => {
    if (EXCEL_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only Excel files (.xlsx, .xls) are allowed'), { code: 'INVALID_FILE_TYPE' }));
    }
  },
});

module.exports = upload;
