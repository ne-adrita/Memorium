const storage = require('../storage');
const Page = require('../models/Page');
const Journal = require('../models/Journal');
const Decoration = require('../models/Decoration');
const Image = require('../models/Image');
const { isValidObjectId, asyncHandler } = require('../utils/helper');

async function ensureJournalOwnership(journalId, userId) {
  const journal = await Journal.findById(journalId);
  if (!journal) return { error: { status: 404, message: 'Journal not found' } };
  if (journal.owner.toString() !== userId) return { error: { status: 403, message: 'Forbidden' } };
  return { journal };
}

async function ensurePageOwnership(pageId, userId) {
  const page = await Page.findById(pageId);
  if (!page) return { error: { status: 404, message: 'Page not found' } };
  const journal = await Journal.findById(page.journal);
  if (!journal) return { error: { status: 404, message: 'Journal not found' } };
  if (journal.owner.toString() !== userId) return { error: { status: 403, message: 'Forbidden' } };
  return { page, journal };
}

const THEME_MIGRATION = {
  parchment: 'classic-leather',
  vintage: 'sepia-vintage',
  aged: 'walnut',
  handwritten: 'blush',
  rose: 'rose-blush',
};
function normalizeTheme(v) {
  return THEME_MIGRATION[v] || v;
}

const PAPER_IDS = ['plain', 'ruled', 'dotted', 'grid', 'vintage', 'handmade', 'torn'];
function normalizePaper(v) {
  if (!v) return v;
  return PAPER_IDS.includes(v) ? v : 'plain';
}

const MOODS = ['happy', 'calm', 'sad', 'angry', 'loved', 'tired'];
const WEATHERS = ['sunny', 'rainy', 'cloudy', 'night'];
function normalizeMood(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  return MOODS.includes(s) ? s : null;
}
function normalizeWeather(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  return WEATHERS.includes(s) ? s : null;
}
function normalizeLocation(v) {
  if (v == null) return '';
  const s = String(v)
    .trim()
    .replace(/<[^>]*>/g, '');
  return s.slice(0, 120);
}

const listPages = asyncHandler(async (req, res) => {
  const { journalId } = req.params;
  if (!journalId)
    return res.status(404).json({ success: false, message: 'Use /api/journals/:journalId/pages' });
  if (!isValidObjectId(journalId))
    return res.status(400).json({ success: false, message: 'Invalid journal ID' });
  const { error } = await ensureJournalOwnership(journalId, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  const pages = await Page.find({ journal: journalId }).sort({ pageNumber: 1 });
  res.json({ success: true, data: pages });
});

const getPage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid page ID' });
  const { error, page } = await ensurePageOwnership(id, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  res.json({ success: true, data: page });
});

const createPage = asyncHandler(async (req, res) => {
  const { journalId } = req.params;
  if (!isValidObjectId(journalId))
    return res.status(400).json({ success: false, message: 'Invalid journal ID' });
  const { error } = await ensureJournalOwnership(journalId, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const { pageNumber, title, content, theme, paper, date, mood, weather, location } = req.body;
  if (pageNumber === undefined || pageNumber === null) {
    return res.status(400).json({ success: false, message: 'pageNumber is required' });
  }
  const num = Number(pageNumber);
  if (!Number.isInteger(num) || num < 1) {
    return res.status(400).json({ success: false, message: 'pageNumber must be an integer >= 1' });
  }
  const ALLOWED_THEMES = [
    'burgundy-journal',
    'rose-paper',
    'scarlet-vintage',
    'crimson-classic',
    'midnight-blue',
    'ocean-blue',
    'dusty-blue',
    'royal-blue',
    'forest-green',
    'sage-garden',
    'moss-vintage',
    'emerald-classic',
    'plum-velvet',
    'lavender-paper',
    'royal-purple',
    'dusty-violet',
    'classic-leather',
    'coffee-brown',
    'walnut',
    'sepia-vintage',
    'rose-blush',
    'dusty-pink',
    'blush',
    'vintage-pink',
    'parchment',
    'vintage',
    'aged',
    'handwritten',
    'rose',
  ];
  if (theme && !ALLOWED_THEMES.includes(theme)) {
    return res.status(400).json({ success: false, message: 'Invalid theme' });
  }
  if (paper && !PAPER_IDS.includes(paper)) {
    return res.status(400).json({ success: false, message: 'Invalid paper' });
  }
  if (mood && !MOODS.includes(String(mood).trim().toLowerCase())) {
    return res.status(400).json({ success: false, message: 'Invalid mood' });
  }
  if (weather && !WEATHERS.includes(String(weather).trim().toLowerCase())) {
    return res.status(400).json({ success: false, message: 'Invalid weather' });
  }
  if (location && String(location).length > 120) {
    return res
      .status(400)
      .json({ success: false, message: 'Location must be at most 120 characters' });
  }
  // date validated via middleware isISO, but also check here for null/empty
  let dateVal = null;
  if (date !== undefined && date !== null && date !== '') {
    const d = new Date(date);
    if (isNaN(d.getTime()))
      return res.status(400).json({ success: false, message: 'Invalid date' });
    dateVal = d;
  }
  try {
    const page = await Page.create({
      journal: journalId,
      pageNumber: num,
      title: title || '',
      content: content || '',
      theme: normalizeTheme(theme) || 'classic-leather',
      paper: normalizePaper(paper) || 'plain',
      date: dateVal,
      mood: normalizeMood(mood),
      weather: normalizeWeather(weather),
      location: normalizeLocation(location),
    });
    res.status(201).json({ success: true, data: page });
  } catch (err) {
    if (err.code === 11000)
      return res
        .status(409)
        .json({ success: false, message: 'Page number already exists for this journal' });
    throw err;
  }
});

const updatePage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid page ID' });
  const { error } = await ensurePageOwnership(id, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const { pageNumber, title, content, theme, paper, date, mood, weather, location, journal } =
    req.body;
  const update = {};
  if (pageNumber !== undefined) {
    const num = Number(pageNumber);
    if (!Number.isInteger(num) || num < 1)
      return res.status(400).json({ success: false, message: 'pageNumber must be integer >=1' });
    update.pageNumber = num;
  }
  if (title !== undefined) update.title = title;
  if (content !== undefined) update.content = content;
  if (theme !== undefined) {
    const ALLOWED2 = [
      'burgundy-journal',
      'rose-paper',
      'scarlet-vintage',
      'crimson-classic',
      'midnight-blue',
      'ocean-blue',
      'dusty-blue',
      'royal-blue',
      'forest-green',
      'sage-garden',
      'moss-vintage',
      'emerald-classic',
      'plum-velvet',
      'lavender-paper',
      'royal-purple',
      'dusty-violet',
      'classic-leather',
      'coffee-brown',
      'walnut',
      'sepia-vintage',
      'rose-blush',
      'dusty-pink',
      'blush',
      'vintage-pink',
      'parchment',
      'vintage',
      'aged',
      'handwritten',
      'rose',
    ];
    if (!ALLOWED2.includes(theme)) {
      return res.status(400).json({ success: false, message: 'Invalid theme' });
    }
    update.theme = normalizeTheme(theme);
  }
  if (paper !== undefined) {
    if (!PAPER_IDS.includes(paper)) {
      return res.status(400).json({ success: false, message: 'Invalid paper' });
    }
    update.paper = paper;
  }
  if (date !== undefined) {
    if (date === null || date === '') update.date = null;
    else {
      const d = new Date(date);
      if (isNaN(d.getTime()))
        return res.status(400).json({ success: false, message: 'Invalid date' });
      update.date = d;
    }
  }
  if (mood !== undefined) {
    if (mood === null || mood === '') update.mood = null;
    else {
      const m = String(mood).trim().toLowerCase();
      if (!MOODS.includes(m))
        return res.status(400).json({ success: false, message: 'Invalid mood' });
      update.mood = m;
    }
  }
  if (weather !== undefined) {
    if (weather === null || weather === '') update.weather = null;
    else {
      const w = String(weather).trim().toLowerCase();
      if (!WEATHERS.includes(w))
        return res.status(400).json({ success: false, message: 'Invalid weather' });
      update.weather = w;
    }
  }
  if (location !== undefined) {
    if (location === null || location === '') update.location = '';
    else {
      const loc = String(location)
        .trim()
        .replace(/<[^>]*>/g, '')
        .slice(0, 120);
      update.location = loc;
    }
  }
  if (journal !== undefined) {
    if (!isValidObjectId(journal))
      return res.status(400).json({ success: false, message: 'Invalid journal ID' });
    // new journal must also be owned by user
    const { error: jErr } = await ensureJournalOwnership(journal, req.user.id);
    if (jErr) return res.status(jErr.status).json({ success: false, message: jErr.message });
    update.journal = journal;
  }
  try {
    const page = await Page.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    res.json({ success: true, data: page });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: 'Duplicate page number for journal' });
    throw err;
  }
});

const deletePage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid page ID' });
  const { error, page } = await ensurePageOwnership(id, req.user.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  await Decoration.deleteMany({ page: id });
  // Cleanup images for this page via storage adapter
  const images = await Image.find({ page: id });
  for (const img of images) {
    try {
      const pid = img.publicId || img.path || img.url;
      if (pid) await storage.delete(pid);
    } catch (_) {}
  }
  await Image.deleteMany({ page: id });
  await page.deleteOne();
  res.json({ success: true, message: 'Page and decorations deleted' });
});

module.exports = { listPages, getPage, createPage, updatePage, deletePage };
