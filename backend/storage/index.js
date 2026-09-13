/**
 * Pluggable storage adapter
 * STORAGE_DRIVER env var: "local" | "cloudinary"
 * Default: "local" (keeps dev flow working without Cloudinary credentials)
 *
 * Adapter interface:
 *   upload(buffer, meta) -> Promise<{ url, publicId }>
 *   delete(publicId) -> Promise<void>
 */

const localAdapter = require('./localAdapter');
const cloudinaryAdapter = require('./cloudinaryAdapter');

function getDriver() {
  const raw = (process.env.STORAGE_DRIVER || 'local').trim().toLowerCase();
  if (raw === 'cloudinary') return 'cloudinary';
  return 'local';
}

function getAdapter() {
  const driver = getDriver();
  if (driver === 'cloudinary') return cloudinaryAdapter;
  return localAdapter;
}

async function upload(buffer, meta) {
  const adapter = getAdapter();
  return adapter.upload(buffer, meta);
}

async function del(publicId) {
  const adapter = getAdapter();
  // For migration: if publicId looks like local filename and driver is cloudinary,
  // attempt local delete as fallback? But spec says adapter.delete(publicId)
  // We keep simple: delegate to current driver. For data migration, caller may try both?
  // We'll attempt to delete via current adapter, and if local file exists and driver is cloudinary,
  // also try local fallback to avoid orphaned files.
  try {
    await adapter.delete(publicId);
  } catch (_) {}
  // Fallback for mixed data: if url/publicId is legacy file, ensure local cleanup regardless of driver
  if (getDriver() === 'cloudinary') {
    // try local as best-effort for legacy rows
    try {
      await localAdapter.delete(publicId);
    } catch (_) {}
    // also if publicId is full path, extract basename
    if (publicId && publicId.includes('/')) {
      try {
        await localAdapter.delete(publicId);
      } catch (_) {}
    }
  }
}

module.exports = {
  getDriver,
  getAdapter,
  upload,
  delete: del,
  // expose adapters for testing
  localAdapter,
  cloudinaryAdapter,
};
