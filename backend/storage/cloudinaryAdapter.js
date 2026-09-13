const crypto = require('crypto');
const path = require('path');

function getCloudinary() {
  // lazy require so tests can mock without env
  const cloudinary = require('cloudinary').v2;

  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary not configured: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET'
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return cloudinary;
}

/**
 * Cloudinary adapter
 * upload(buffer, meta) -> { url, publicId }
 * meta: { originalName, mimeType }
 */
async function upload(buffer, meta = {}) {
  const cloudinary = getCloudinary();

  const ext =
    path
      .extname(meta.originalName || '')
      .toLowerCase()
      .replace('.', '') || 'jpg';
  // Generate unique publicId; use folder memorium/ for organization
  const unique = crypto.randomBytes(8).toString('hex') + '-' + Date.now();
  const publicId = `memorium/${unique}`;

  // Need to send buffer via upload_stream
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: 'image',
        // Let cloudinary derive format from buffer; optionally force
        // but keep original ext hint
        folder: undefined,
      },
      (err, res) => {
        if (err) return reject(err);
        resolve(res);
      }
    );
    stream.end(buffer);
  });

  return {
    publicId: result.public_id,
    url: result.secure_url,
    // also return filename hint for DB compatibility
    filename: path.basename(result.public_id) + '.' + (result.format || ext),
  };
}

/**
 * Delete by publicId (cloudinary public_id, e.g. "memorium/abc123")
 */
async function del(publicId) {
  if (!publicId) return;
  const cloudinary = getCloudinary();
  // cloudinary destroy is idempotent; ignore not-found
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (_) {
    // ignore
  }
}

module.exports = { upload, delete: del };
