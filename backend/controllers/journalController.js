const fs = require('fs');
const Journal = require('../models/Journal');
const Page = require('../models/Page');
const Decoration = require('../models/Decoration');
const Image = require('../models/Image');
const { isValidObjectId, asyncHandler } = require('../utils/helper');

const listJournals = asyncHandler(async (req, res) => {
  // Protected: only own journals
  const journals = await Journal.find({ owner: req.user.id }).sort({ updatedAt: -1 });
  res.json({ success: true, data: journals });
});

const getJournal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid journal ID' });
  const journal = await Journal.findById(id);
  if (!journal) return res.status(404).json({ success: false, message: 'Journal not found' });
  if (journal.owner.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  res.json({ success: true, data: journal });
});

const createJournal = asyncHandler(async (req, res) => {
  const { title, description, cover } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: 'Title is required' });
  }
  const journal = await Journal.create({
    owner: req.user.id,
    title: title.trim(),
    description: description || '',
    cover: cover || undefined,
  });
  res.status(201).json({ success: true, data: journal });
});

const updateJournal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid journal ID' });
  const journal = await Journal.findById(id);
  if (!journal) return res.status(404).json({ success: false, message: 'Journal not found' });
  if (journal.owner.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const { title, description, cover } = req.body;
  if (title !== undefined) {
    if (!title.trim()) return res.status(400).json({ success: false, message: 'Title cannot be empty' });
    journal.title = title.trim();
  }
  if (description !== undefined) journal.description = description;
  if (cover !== undefined) journal.cover = cover;
  await journal.save();
  res.json({ success: true, data: journal });
});

const deleteJournal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid journal ID' });
  const journal = await Journal.findById(id);
  if (!journal) return res.status(404).json({ success: false, message: 'Journal not found' });
  if (journal.owner.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const pages = await Page.find({ journal: id }).select('_id');
  const pageIds = pages.map((p) => p._id);
  if (pageIds.length) {
    await Decoration.deleteMany({ page: { $in: pageIds } });
    // Cleanup images for all pages in this journal
    const images = await Image.find({ page: { $in: pageIds } });
    for (const img of images) {
      try { if (fs.existsSync(img.path)) fs.unlinkSync(img.path); } catch (_) {}
    }
    await Image.deleteMany({ page: { $in: pageIds } });
    await Page.deleteMany({ journal: id });
  }
  await journal.deleteOne();
  res.json({ success: true, message: 'Journal and associated pages/decorations/images deleted' });
});

module.exports = { listJournals, getJournal, createJournal, updateJournal, deleteJournal };
