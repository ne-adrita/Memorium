const path = require('path');
const fs = require('fs');
const Image = require('../models/Image');
const Page = require('../models/Page');
const Journal = require('../models/Journal');
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
    if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ success: false, message: 'Invalid page ID' });
  }
  const { error } = await ensurePageOwnership(pageId, req.user.id);
  if (error) {
    if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
    return res.status(error.status).json({ success: false, message: error.message });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No image file provided' });
  }

  // Optional position from body (JSON part of multipart may be strings)
  let x = 24, y = 24, rotation = 0;
  if (req.body.x !== undefined) {
    const v = Number(req.body.x);
    if (!Number.isNaN(v) && v >= 0) x = v;
  }
  if (req.body.y !== undefined) {
    const v = Number(req.body.y);
    if (!Number.isNaN(v) && v >= 0) y = v;
  }
  if (req.body.rotation !== undefined) {
    const v = Number(req.body.rotation);
    if (!Number.isNaN(v) && v >= -180 && v <= 180) rotation = v;
  }

  const image = await Image.create({
    page: pageId,
    user: req.user.id,
    originalName: req.file.originalname,
    filename: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    path: req.file.path,
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
  if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid image ID' });
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

  // Check file exists
  if (!fs.existsSync(image.path)) {
    return res.status(404).json({ success: false, message: 'Image file not found' });
  }

  res.sendFile(path.resolve(image.path));
});

const updateImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid image ID' });
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
    if (typeof x === 'number' && typeof y === 'number' && x >= 0 && y >= 0) {
      update.position = { x, y };
    }
  }
  if (req.body.x !== undefined || req.body.y !== undefined) {
    // Allow flat x,y for multipart? but JSON will have position
    const x = req.body.x !== undefined ? Number(req.body.x) : image.position.x;
    const y = req.body.y !== undefined ? Number(req.body.y) : image.position.y;
    if (!Number.isNaN(x) && !Number.isNaN(y) && x >= 0 && y >= 0) update.position = { x, y };
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
  if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid image ID' });
  const image = await Image.findById(id);
  if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

  const page = await Page.findById(image.page);
  if (!page) return res.status(404).json({ success: false, message: 'Page not found' });
  const journal = await Journal.findById(page.journal);
  if (!journal) return res.status(404).json({ success: false, message: 'Journal not found' });
  if (journal.owner.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  // Delete file safely
  try {
    if (fs.existsSync(image.path)) {
      fs.unlinkSync(image.path);
    }
  } catch (_) {
    // ignore filesystem error, continue to delete DB record
  }

  await image.deleteOne();
  res.json({ success: true, message: 'Image deleted' });
});

const listImagesByPage = asyncHandler(async (req, res) => {
  const { pageId } = req.params;
  if (!isValidObjectId(pageId)) return res.status(400).json({ success: false, message: 'Invalid page ID' });
  const { error } = await ensurePageOwnership(pageId, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const images = await Image.find({ page: pageId }).sort({ createdAt: 1 });
  const data = images.map((img) => ({
    _id: img._id,
    page: img.page,
    user: img.user,
    originalName: img.originalName,
    filename: img.filename,
    mimeType: img.mimeType,
    size: img.size,
    position: img.position,
    rotation: img.rotation,
    url: `/api/images/${img._id}`,
    createdAt: img.createdAt,
  }));
  res.json({ success: true, data });
});

module.exports = { uploadImage, getImage, updateImage, deleteImage, listImagesByPage };
