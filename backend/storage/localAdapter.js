const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'images');

// Ensure directory exists (sync at load; safe for tests)
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Local adapter — writes buffer to uploads/images/
 * publicId is the filename (e.g., "a1b2c3-123456.jpg")
 * url is absolute file path (used for streaming via GET)
 */
async function upload(buffer, meta = {}) {
  const originalName = meta.originalName || 'file';
  const ext = path.extname(originalName).toLowerCase();
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
  const unique = crypto.randomBytes(16).toString('hex') + '-' + Date.now() + safeExt;
  const filename = unique;
  const filePath = path.join(UPLOAD_DIR, filename);

  await fs.promises.writeFile(filePath, buffer);

  return {
    publicId: filename,
    url: filePath,
    filename,
    path: filePath,
  };
}

/**
 * Delete file by publicId (filename). Safe no-op if missing.
 */
async function del(publicId) {
  if (!publicId) return;
  // prevent directory traversal
  const safe = path.basename(publicId);
  const filePath = path.join(UPLOAD_DIR, safe);
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (_) {
    // ignore
  }
}

/**
 * Helper for controller: resolve absolute path for streaming
 */
function resolvePath(publicId) {
  if (!publicId) return null;
  return path.join(UPLOAD_DIR, path.basename(publicId));
}

/**
 * Check existence (used by GET)
 */
function exists(publicId) {
  if (!publicId) return false;
  return fs.existsSync(resolvePath(publicId));
}

module.exports = { upload, delete: del, UPLOAD_DIR, resolvePath, exists };
