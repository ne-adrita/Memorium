const storage = require('../storage');
const Journal = require('../models/Journal');
const Page = require('../models/Page');
const Decoration = require('../models/Decoration');
const Image = require('../models/Image');
const { isValidObjectId, asyncHandler } = require('../utils/helper');

const THEME_MIGRATION = {
  parchment: 'classic-leather',
  vintage: 'sepia-vintage',
  aged: 'walnut',
  handwritten: 'blush',
  rose: 'rose-blush',
};
function normalizeThemeId(v) {
  if (!v) return v;
  return THEME_MIGRATION[v] || v;
}

const listJournals = asyncHandler(async (req, res) => {
  // Protected: only own journals — sorted pinned first, then most recently updated
  const journals = await Journal.find({ owner: req.user.id })
    .sort({ isPinned: -1, updatedAt: -1 })
    .lean();
  if (!journals.length) return res.json({ success: true, data: journals });

  const journalIds = journals.map(j => j._id);

  // Efficient page counts per journal (single aggregation)
  const counts = await Page.aggregate([
    { $match: { journal: { $in: journalIds } } },
    { $group: { _id: '$journal', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  counts.forEach(c => {
    countMap[String(c._id)] = c.count;
  });

  // Lightweight preview: first page (pageNumber 1) snippet per journal, no full content load for all pages
  // Fetch only pageNumber 1 and latest updated page for preview/lastPageUpdate
  const previews = await Page.find({ journal: { $in: journalIds }, pageNumber: 1 })
    .select('journal content updatedAt pageNumber title')
    .lean();
  const previewMap = {};
  previews.forEach(p => {
    previewMap[String(p.journal)] = p;
  });

  // Also find latest page updatedAt per journal to compute richer lastUpdated (journal or its pages)
  const latestPages = await Page.aggregate([
    { $match: { journal: { $in: journalIds } } },
    { $sort: { updatedAt: -1 } },
    {
      $group: {
        _id: '$journal',
        latestPageUpdatedAt: { $first: '$updatedAt' },
        latestPageId: { $first: '$_id' },
      },
    },
  ]);
  const latestMap = {};
  latestPages.forEach(l => {
    latestMap[String(l._id)] = l.latestPageUpdatedAt;
  });

  const enriched = journals.map(j => {
    const idStr = String(j._id);
    const pageCount = countMap[idStr] || 0;
    const previewDoc = previewMap[idStr] || null;
    // Strip HTML to text for preview snippet (max 140 chars)
    let previewText = '';
    if (previewDoc && previewDoc.content) {
      previewText = previewDoc.content
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140);
    }
    const lastPageUpdate = latestMap[idStr] || null;
    // Effective last updated is max of journal updatedAt and latest page update
    let effectiveUpdatedAt = j.updatedAt;
    if (lastPageUpdate && new Date(lastPageUpdate) > new Date(j.updatedAt))
      effectiveUpdatedAt = lastPageUpdate;
    return {
      ...j,
      pageCount,
      previewText,
      previewPageId: previewDoc ? previewDoc._id : null,
      lastPageUpdatedAt: lastPageUpdate,
      effectiveUpdatedAt,
    };
  });

  res.json({ success: true, data: enriched });
});

const getJournal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid journal ID' });
  const journal = await Journal.findById(id);
  if (!journal) return res.status(404).json({ success: false, message: 'Journal not found' });
  if (journal.owner.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  res.json({ success: true, data: journal });
});

const PAPER_IDS = ['plain', 'ruled', 'dotted', 'grid', 'vintage', 'handmade', 'torn'];
function normalizePaper(v) {
  if (!v) return v;
  return PAPER_IDS.includes(v) ? v : 'plain';
}

function sanitizeCover(cover) {
  if (cover == null) return undefined;
  if (typeof cover !== 'object' || Array.isArray(cover)) return undefined;
  const out = {};
  if (cover.color !== undefined) {
    let c = String(cover.color).trim().slice(0, 30);
    c = c.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '');
    if (/^#[0-9a-fA-F]{3,8}$/.test(c) || /^[a-zA-Z]+$/.test(c) || /^rgba?\(/.test(c)) out.color = c;
    else out.color = '#5C3D2E';
  }
  if (cover.texture !== undefined) {
    const allowed = ['leather', 'fabric', 'paper', 'linen'];
    if (allowed.includes(String(cover.texture))) out.texture = String(cover.texture);
  }
  return Object.keys(out).length ? out : undefined;
}
const createJournal = asyncHandler(async (req, res) => {
  const { title, description, cover, themeId, paper, isPinned } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: 'Title is required' });
  }
  // Reject prototype pollution keys in body (own properties only)
  if (
    cover &&
    typeof cover === 'object' &&
    (Object.prototype.hasOwnProperty.call(cover, '__proto__') ||
      Object.prototype.hasOwnProperty.call(cover, 'constructor') ||
      Object.prototype.hasOwnProperty.call(cover, 'prototype') ||
      Object.prototype.hasOwnProperty.call(req.body, '$where'))
  ) {
    return res.status(400).json({ success: false, message: 'Invalid cover' });
  }
  const journal = await Journal.create({
    owner: req.user.id,
    title: title.trim(),
    description: description || '',
    cover: sanitizeCover(cover),
    themeId: normalizeThemeId(themeId) || 'classic-leather',
    paper: normalizePaper(paper) || 'plain',
    isPinned: isPinned === true || isPinned === 'true',
  });
  // Return enriched with pageCount etc for immediate bookshelf use
  const obj = journal.toObject();
  obj.pageCount = 0;
  obj.previewText = '';
  obj.effectiveUpdatedAt = obj.updatedAt;
  res.status(201).json({ success: true, data: obj });
});

const updateJournal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid journal ID' });
  const journal = await Journal.findById(id);
  if (!journal) return res.status(404).json({ success: false, message: 'Journal not found' });
  if (journal.owner.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const { title, description, cover, themeId, paper, isPinned, favorite, pinned } = req.body;
  if (title !== undefined) {
    if (!title.trim())
      return res.status(400).json({ success: false, message: 'Title cannot be empty' });
    journal.title = title.trim();
  }
  if (description !== undefined)
    journal.description = String(description)
      .replace(/<[^>]*>/g, '')
      .slice(0, 500);
  if (cover !== undefined) {
    const sc = sanitizeCover(cover);
    if (sc) journal.cover = sc;
  }
  if (themeId !== undefined) journal.themeId = normalizeThemeId(themeId);
  if (paper !== undefined) {
    if (!PAPER_IDS.includes(paper))
      return res.status(400).json({ success: false, message: 'Invalid paper' });
    journal.paper = paper;
  }
  // Favorite/pin support — accept isPinned, pinned, or favorite for flexibility
  const pinRaw = isPinned !== undefined ? isPinned : pinned !== undefined ? pinned : favorite;
  if (pinRaw !== undefined) {
    journal.isPinned = pinRaw === true || pinRaw === 'true' || pinRaw === 1 || pinRaw === '1';
  }
  await journal.save();
  res.json({ success: true, data: journal });
});

const deleteJournal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid journal ID' });
  const journal = await Journal.findById(id);
  if (!journal) return res.status(404).json({ success: false, message: 'Journal not found' });
  if (journal.owner.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const pages = await Page.find({ journal: id }).select('_id');
  const pageIds = pages.map(p => p._id);
  if (pageIds.length) {
    await Decoration.deleteMany({ page: { $in: pageIds } });
    // Cleanup images for all pages in this journal via storage adapter
    const images = await Image.find({ page: { $in: pageIds } });
    for (const img of images) {
      try {
        const pid = img.publicId || img.path || img.url;
        if (pid) await storage.delete(pid);
      } catch (_) {}
    }
    await Image.deleteMany({ page: { $in: pageIds } });
    await Page.deleteMany({ journal: id });
  }
  await journal.deleteOne();
  res.json({ success: true, message: 'Journal and associated pages/decorations/images deleted' });
});

module.exports = { listJournals, getJournal, createJournal, updateJournal, deleteJournal };
