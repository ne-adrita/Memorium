const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'images');

// Ensure directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(_req, file, cb) {
    // Generate safe unique filename, ignore original
    const ext = path.extname(file.originalname).toLowerCase();
    // Map mime to safe extension if needed
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    const unique = crypto.randomBytes(16).toString('hex') + '-' + Date.now() + safeExt;
    cb(null, unique);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Allowed: JPEG, PNG, WEBP, GIF'), false);
  }
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter,
});

module.exports = { upload, UPLOAD_DIR, ALLOWED_MIME, MAX_SIZE };
