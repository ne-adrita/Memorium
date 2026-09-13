const Decoration = require('../models/Decoration');
const Page = require('../models/Page');
const Journal = require('../models/Journal');
const { isValidObjectId, asyncHandler } = require('../utils/helper');

const VALID_TYPES = ['sticky', 'sticker', 'paper', 'flower', 'tape'];

async function ensurePageOwnership(pageId, userId) {
  const page = await Page.findById(pageId);
  if (!page) return { error: { status: 404, message: 'Page not found' } };
  const journal = await Journal.findById(page.journal);
  if (!journal) return { error: { status: 404, message: 'Journal not found' } };
  if (journal.owner.toString() !== userId) return { error: { status: 403, message: 'Forbidden' } };
  return { page, journal };
}

async function ensureDecorationOwnership(decorationId, userId) {
  const deco = await Decoration.findById(decorationId);
  if (!deco) return { error: { status: 404, message: 'Decoration not found' } };
  const page = await Page.findById(deco.page);
  if (!page) return { error: { status: 404, message: 'Page not found' } };
  const journal = await Journal.findById(page.journal);
  if (!journal) return { error: { status: 404, message: 'Journal not found' } };
  if (journal.owner.toString() !== userId) return { error: { status: 403, message: 'Forbidden' } };
  return { deco, page, journal };
}

const listDecorations = asyncHandler(async (req, res) => {
  const { pageId } = req.params;
  if (!isValidObjectId(pageId)) return res.status(400).json({ success: false, message: 'Invalid page ID' });
  const { error } = await ensurePageOwnership(pageId, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  const decs = await Decoration.find({ page: pageId }).sort({ createdAt: 1 });
  res.json({ success: true, data: decs });
});

const createDecoration = asyncHandler(async (req, res) => {
  const { pageId } = req.params;
  if (!isValidObjectId(pageId)) return res.status(400).json({ success: false, message: 'Invalid page ID' });
  const { error } = await ensurePageOwnership(pageId, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const { type, position, size, rotation, text, emoji, config } = req.body;
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: `type is required and must be one of ${VALID_TYPES.join(', ')}` });
  }
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    return res.status(400).json({ success: false, message: 'position {x, y} numbers are required' });
  }
  if (position.x < 0 || position.y < 0) {
    return res.status(400).json({ success: false, message: 'position x,y must be >= 0' });
  }
  if (rotation !== undefined && (typeof rotation !== 'number' || rotation < -180 || rotation > 180)) {
    return res.status(400).json({ success: false, message: 'rotation must be -180..180' });
  }

  const deco = await Decoration.create({
    page: pageId,
    type,
    position: { x: position.x, y: position.y },
    size: size ? { width: size.width ?? null, height: size.height ?? null } : undefined,
    rotation: rotation ?? 0,
    text: text ?? null,
    emoji: emoji ?? null,
    config: config ?? {},
  });
  res.status(201).json({ success: true, data: deco });
});

const updateDecoration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid decoration ID' });
  const { error } = await ensureDecorationOwnership(id, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const { type, position, size, rotation, text, emoji, config, page } = req.body;
  const update = {};
  if (type !== undefined) {
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ success: false, message: `Invalid type, must be ${VALID_TYPES.join(', ')}` });
    update.type = type;
  }
  if (position !== undefined) {
    if (typeof position.x !== 'number' || typeof position.y !== 'number') {
      return res.status(400).json({ success: false, message: 'position x,y must be numbers' });
    }
    update.position = { x: position.x, y: position.y };
  }
  if (size !== undefined) update.size = size;
  if (rotation !== undefined) {
    if (typeof rotation !== 'number' || rotation < -180 || rotation > 180) {
      return res.status(400).json({ success: false, message: 'rotation must be -180..180' });
    }
    update.rotation = rotation;
  }
  if (text !== undefined) update.text = text;
  if (emoji !== undefined) update.emoji = emoji;
  if (config !== undefined) update.config = config;
  if (page !== undefined) {
    if (!isValidObjectId(page)) return res.status(400).json({ success: false, message: 'Invalid page ID' });
    const { error: pErr } = await ensurePageOwnership(page, req.user.id);
    if (pErr) return res.status(pErr.status).json({ success: false, message: pErr.message });
    update.page = page;
  }

  const deco = await Decoration.findByIdAndUpdate(id, update, { new: true, runValidators: true });
  res.json({ success: true, data: deco });
});

const deleteDecoration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid decoration ID' });
  const { error, deco } = await ensureDecorationOwnership(id, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  await deco.deleteOne();
  res.json({ success: true, message: 'Decoration deleted' });
});

const getDecoration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid decoration ID' });
  const { error, deco } = await ensureDecorationOwnership(id, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  res.json({ success: true, data: deco });
});

module.exports = { listDecorations, createDecoration, updateDecoration, deleteDecoration, getDecoration };
