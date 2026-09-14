const path = require('path');
const fs = require('fs');
const Image = require('../models/Image');
const Page = require('../models/Page');
const Journal = require('../models/Journal');
const storage = require('../storage');
const localAdapter = require('../storage/localAdapter');
const { isValidObjectId, asyncHandler } = require('../utils/helper');

async function ensurePageOwnership(pageId, userId) {
  const page = await Page.findById(pageId);
  if (!page) return { error: { status: 404, message: 'Page not found' } };
  const journal = await Journal.findById(page.journal);
  if (!journal) return { error: { status: 404, message: 'Journal not found' } };
  if (journal.owner.toString() !== userId) return { error: { status: 403, message: 'Forbidden' } };
  return { page, journal };
}

const uploadImage = asyncHandler(async (req, res) => {
  const { pageId } = req.params;
  if (!isValidObjectId(pageId)) {
    // memoryStorage: no file to clean; keep backward compat if disk file exists
    if (req.file && req.file.path)
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {}
    return res.status(400).json({ success: false, message: 'Invalid page ID' });
  }
  const { error } = await ensurePageOwnership(pageId, req.user.id);
  if (error) {
    if (req.file && req.file.path)
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {}
    return res.status(error.status).json({ success: false, message: error.message });
  }
  if (!req.file || !req.file.buffer) {
    // Fallback: support disk file if present (legacy) but primary is buffer
    return res.status(400).json({ success: false, message: 'No image file provided' });
  }

  // Optional position from body (JSON part of multipart may be strings)
  let x = 24,
    y = 24,
    rotation = 0;
  if (req.body.x !== undefined) {
    const v = Number(req.body.x);
    if (!Number.isNaN(v) && v >= 0 && v <= 3000) x = v;
  }
  if (req.body.y !== undefined) {
    const v = Number(req.body.y);
    if (!Number.isNaN(v) && v >= 0 && v <= 3000) y = v;
  }
  if (req.body.rotation !== undefined) {
    const v = Number(req.body.rotation);
    if (!Number.isNaN(v) && v >= -180 && v <= 180) rotation = v;
  }

  // Pluggable storage: upload buffer to selected driver (local or cloudinary)
  const meta = {
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  };
  let stored;
  try {
    stored = await storage.upload(req.file.buffer, meta);
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Storage upload failed' });
  }

  const filename = stored.filename || stored.publicId || req.file.originalname;

  const image = await Image.create({
    page: pageId,
    user: req.user.id,
    originalName: req.file.originalname,
    filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    publicId: stored.publicId,
    url: stored.url,
    path: stored.path || stored.url || null,
    position: { x, y },
    rotation,
  });

  res.status(201).json({
    success: true,
    data: {
      _id: image._id,
      page: image.page,
      user: image.user,
      originalName: image.originalName,
      filename: image.filename,
      mimeType: image.mimeType,
      size: image.size,
      position: image.position,
      rotation: image.rotation,
      url: `/api/images/${image._id}`,
      createdAt: image.createdAt,
    },
  });
});

const getImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid image ID' });
  const image = await Image.findById(id);
  if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

  // Verify ownership via page -> journal
  const page = await Page.findById(image.page);
  if (!page) return res.status(404).json({ success: false, message: 'Page not found' });
  const journal = await Journal.findById(page.journal);
  if (!journal) return res.status(404).json({ success: false, message: 'Journal not found' });
  if (journal.owner.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  // Cloudinary (or any http url): redirect to stored url
  const url = image.url || '';
  if (/^https?:\/\//i.test(url)) {
    return res.redirect(url);
  }

  // Local: stream file from publicId/path/url
  // Prefer publicId, fallback to legacy path/url
  let filePath = null;
  if (image.publicId) {
    const candidate = localAdapter.resolvePath(image.publicId);
    if (fs.existsSync(candidate)) filePath = candidate;
  }
  if (!filePath && image.path && fs.existsSync(image.path)) filePath = image.path;
  if (!filePath && image.url && fs.existsSync(image.url)) filePath = image.url;
  // Also try url as relative publicId if it was file://
  if (!filePath) {
    // last fallback: treat url basename as file
    const base = image.url ? path.basename(image.url) : null;
    if (base) {
      const cand2 = localAdapter.resolvePath(base);
      if (fs.existsSync(cand2)) filePath = cand2;
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Image file not found' });
  }

  res.sendFile(path.resolve(filePath));
});

const updateImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid image ID' });
  const image = await Image.findById(id);
  if (!image) return res.status(404).json({ success: false, message: 'Image not found' });
  const page = await Page.findById(image.page);
  if (!page) return res.status(404).json({ success: false, message: 'Page not found' });
  const journal = await Journal.findById(page.journal);
  if (!journal) return res.status(404).json({ success: false, message: 'Journal not found' });
  if (journal.owner.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const update = {};
  if (req.body.position) {
    const { x, y } = req.body.position;
    if (
      typeof x === 'number' &&
      typeof y === 'number' &&
      x >= 0 &&
      y >= 0 &&
      x <= 3000 &&
      y <= 3000
    ) {
      update.position = { x, y };
    }
  }
  if (req.body.x !== undefined || req.body.y !== undefined) {
    const x = req.body.x !== undefined ? Number(req.body.x) : image.position.x;
    const y = req.body.y !== undefined ? Number(req.body.y) : image.position.y;
    if (!Number.isNaN(x) && !Number.isNaN(y) && x >= 0 && y >= 0 && x <= 3000 && y <= 3000)
      update.position = { x, y };
  }
  if (req.body.rotation !== undefined) {
    const v = Number(req.body.rotation);
    if (!Number.isNaN(v) && v >= -180 && v <= 180) update.rotation = v;
  }
  Object.assign(image, update);
  await image.save();
  res.json({
    success: true,
    data: {
      _id: image._id,
      page: image.page,
      position: image.position,
      rotation: image.rotation,
      url: `/api/images/${image._id}`,
    },
  });
});

const deleteImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid image ID' });
  const image = await Image.findById(id);
  if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

  const page = await Page.findById(image.page);
  if (!page) return res.status(404).json({ success: false, message: 'Page not found' });
  const journal = await Journal.findById(page.journal);
  if (!journal) return res.status(404).json({ success: false, message: 'Journal not found' });
  if (journal.owner.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  // Delete via storage adapter (handles local or cloudinary)
  try {
    const pid = image.publicId || image.path || image.url;
    if (pid) await storage.delete(pid);
  } catch (_) {
    // ignore storage error, still delete DB record
  }
  // Legacy fallback: also try direct fs cleanup for local files if adapter delete missed
  try {
    if (image.path && fs.existsSync(image.path)) fs.unlinkSync(image.path);
    if (image.publicId) {
      const lp = localAdapter.resolvePath(image.publicId);
      if (fs.existsSync(lp)) fs.unlinkSync(lp);
    }
  } catch (_) {}

  await image.deleteOne();
  res.json({ success: true, message: 'Image deleted' });
});

const listImagesByPage = asyncHandler(async (req, res) => {
  const { pageId } = req.params;
  if (!isValidObjectId(pageId))
    return res.status(400).json({ success: false, message: 'Invalid page ID' });
  const { error } = await ensurePageOwnership(pageId, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const images = await Image.find({ page: pageId }).sort({ createdAt: 1 });
  const data = images.map(img => {
    // For cloudinary, expose the remote url; for local, keep API indirection
    const remoteUrl = img.url && /^https?:\/\//i.test(img.url) ? img.url : null;
    return {
      _id: img._id,
      page: img.page,
      user: img.user,
      originalName: img.originalName,
      filename: img.filename,
      mimeType: img.mimeType,
      size: img.size,
      position: img.position,
      rotation: img.rotation,
      publicId: img.publicId,
      url: `/api/images/${img._id}`,
      remoteUrl: remoteUrl || undefined,
      createdAt: img.createdAt,
    };
  });
  res.json({ success: true, data });
});

module.exports = { uploadImage, getImage, updateImage, deleteImage, listImagesByPage };
