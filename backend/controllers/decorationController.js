const Decoration = require('../models/Decoration');
const Page = require('../models/Page');
const Journal = require('../models/Journal');
const { isValidObjectId, asyncHandler } = require('../utils/helper');

const VALID_TYPES = ['sticky', 'tape', 'paper', 'flower', 'sticker', 'stamp', 'bookmark', 'clip'];

// Security helpers — strip HTML and cap sizes
function stripTags(v) {
  if (typeof v !== 'string') return v;
  return v.replace(/<[^>]*>/g, '');
}
function sanitizeText(v, max) {
  if (v == null) return null;
  if (typeof v !== 'string') v = String(v);
  v = stripTags(v);
  // remove javascript:/data: schemes embedded
  v = v.replace(/javascript:/gi, '').replace(/data:\s*text\/html/gi, '');
  v = v.replace(/\bon\w+\s*=/gi, '');
  if (max && v.length > max) v = v.slice(0, max);
  return v.trim() || null;
}
function sanitizeEmoji(v) {
  if (v == null) return null;
  let s = String(v).trim();
  s = stripTags(s);
  if (s.length > 10) s = s.slice(0, 10);
  // allow emoji + short text, but no HTML/event attributes
  if (/javascript:/i.test(s) || /\bon\w+=/i.test(s)) return null;
  return s || null;
}
function isPlainObject(o) {
  return (
    o && typeof o === 'object' && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype
  );
}
function sanitizeConfig(cfg) {
  if (cfg == null) return {};
  if (!isPlainObject(cfg)) return {};
  const out = {};
  for (const k of Object.keys(cfg)) {
    if (
      k.startsWith('$') ||
      k.includes('.') ||
      k === '__proto__' ||
      k === 'constructor' ||
      k === 'prototype'
    )
      continue;
    const val = cfg[k];
    if (typeof val === 'string') {
      const s = stripTags(val).slice(0, 500);
      if (/javascript:/i.test(s) || /data:\s*text\/html/i.test(s)) continue;
      if (s.length > 500) continue;
      out[k] = s;
    } else if (typeof val === 'number') {
      if (!Number.isFinite(val)) continue;
      if (Math.abs(val) > 1e6) continue;
      out[k] = val;
    } else if (typeof val === 'boolean') {
      out[k] = val;
    } else if (val == null) {
      out[k] = null;
    }
    // ignore nested objects/arrays for now to keep Minimal
  }
  return out;
}
const MAX_POS = 3000;
const MAX_SIZE_DIM = 3000;

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
  if (!isValidObjectId(pageId))
    return res.status(400).json({ success: false, message: 'Invalid page ID' });
  const { error } = await ensurePageOwnership(pageId, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  const decs = await Decoration.find({ page: pageId }).sort({ createdAt: 1 });
  res.json({ success: true, data: decs });
});

const createDecoration = asyncHandler(async (req, res) => {
  const { pageId } = req.params;
  if (!isValidObjectId(pageId))
    return res.status(400).json({ success: false, message: 'Invalid page ID' });
  const { error } = await ensurePageOwnership(pageId, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const { type, position, size, rotation, text, emoji, config } = req.body;
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({
      success: false,
      message: `type is required and must be one of ${VALID_TYPES.join(', ')}`,
    });
  }
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    return res
      .status(400)
      .json({ success: false, message: 'position {x, y} numbers are required' });
  }
  if (position.x < 0 || position.y < 0 || position.x > MAX_POS || position.y > MAX_POS) {
    return res.status(400).json({ success: false, message: `position x,y must be 0..${MAX_POS}` });
  }
  if (
    rotation !== undefined &&
    (typeof rotation !== 'number' || rotation < -180 || rotation > 180)
  ) {
    return res.status(400).json({ success: false, message: 'rotation must be -180..180' });
  }
  // size validation
  let safeSize;
  if (size !== undefined && size !== null) {
    if (!isPlainObject(size))
      return res
        .status(400)
        .json({ success: false, message: 'size must be object {width,height}' });
    if (size.width != null) {
      if (typeof size.width !== 'number' || size.width < 0 || size.width > MAX_SIZE_DIM)
        return res
          .status(400)
          .json({ success: false, message: `size.width must be 0..${MAX_SIZE_DIM}` });
    }
    if (size.height != null) {
      if (typeof size.height !== 'number' || size.height < 0 || size.height > MAX_SIZE_DIM)
        return res
          .status(400)
          .json({ success: false, message: `size.height must be 0..${MAX_SIZE_DIM}` });
    }
    safeSize = { width: size.width ?? null, height: size.height ?? null };
  }
  const safeText = sanitizeText(text, 1000);
  const safeEmoji = sanitizeEmoji(emoji);
  const safeConfig = sanitizeConfig(config);

  const deco = await Decoration.create({
    page: pageId,
    type,
    position: { x: position.x, y: position.y },
    size: safeSize,
    rotation: rotation ?? 0,
    text: safeText,
    emoji: safeEmoji,
    config: safeConfig,
  });
  res.status(201).json({ success: true, data: deco });
});

const updateDecoration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid decoration ID' });
  const { error } = await ensureDecorationOwnership(id, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const { type, position, size, rotation, text, emoji, config, page } = req.body;
  const update = {};
  if (type !== undefined) {
    if (!VALID_TYPES.includes(type))
      return res
        .status(400)
        .json({ success: false, message: `Invalid type, must be ${VALID_TYPES.join(', ')}` });
    update.type = type;
  }
  if (position !== undefined) {
    if (typeof position.x !== 'number' || typeof position.y !== 'number') {
      return res.status(400).json({ success: false, message: 'position x,y must be numbers' });
    }
    if (position.x < 0 || position.y < 0 || position.x > MAX_POS || position.y > MAX_POS) {
      return res
        .status(400)
        .json({ success: false, message: `position x,y must be 0..${MAX_POS}` });
    }
    update.position = { x: position.x, y: position.y };
  }
  if (size !== undefined) {
    if (size === null) update.size = null;
    else {
      if (!isPlainObject(size))
        return res
          .status(400)
          .json({ success: false, message: 'size must be object {width,height}' });
      if (
        size.width != null &&
        (typeof size.width !== 'number' || size.width < 0 || size.width > MAX_SIZE_DIM)
      )
        return res
          .status(400)
          .json({ success: false, message: `size.width must be 0..${MAX_SIZE_DIM}` });
      if (
        size.height != null &&
        (typeof size.height !== 'number' || size.height < 0 || size.height > MAX_SIZE_DIM)
      )
        return res
          .status(400)
          .json({ success: false, message: `size.height must be 0..${MAX_SIZE_DIM}` });
      update.size = { width: size.width ?? null, height: size.height ?? null };
    }
  }
  if (rotation !== undefined) {
    if (typeof rotation !== 'number' || rotation < -180 || rotation > 180) {
      return res.status(400).json({ success: false, message: 'rotation must be -180..180' });
    }
    update.rotation = rotation;
  }
  if (text !== undefined) update.text = sanitizeText(text, 1000);
  if (emoji !== undefined) update.emoji = sanitizeEmoji(emoji);
  if (config !== undefined) update.config = sanitizeConfig(config);
  if (page !== undefined) {
    if (!isValidObjectId(page))
      return res.status(400).json({ success: false, message: 'Invalid page ID' });
    const { error: pErr } = await ensurePageOwnership(page, req.user.id);
    if (pErr) return res.status(pErr.status).json({ success: false, message: pErr.message });
    update.page = page;
  }

  const deco = await Decoration.findByIdAndUpdate(id, update, { new: true, runValidators: true });
  res.json({ success: true, data: deco });
});

const deleteDecoration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid decoration ID' });
  const { error, deco } = await ensureDecorationOwnership(id, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  await deco.deleteOne();
  res.json({ success: true, message: 'Decoration deleted' });
});

const getDecoration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid decoration ID' });
  const { error, deco } = await ensureDecorationOwnership(id, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  res.json({ success: true, data: deco });
});

module.exports = {
  listDecorations,
  createDecoration,
  updateDecoration,
  deleteDecoration,
  getDecoration,
};
