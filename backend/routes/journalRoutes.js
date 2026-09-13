const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { validateJournalCreate, validateJournalUpdate } = require('../middleware/validate');
const {
  listJournals,
  getJournal,
  createJournal,
  updateJournal,
  deleteJournal,
} = require('../controllers/journalController');

// All journal routes are protected — require JWT
router.use(authMiddleware);

router.get('/', listJournals);
router.post('/', validateJournalCreate, createJournal);
router.get('/:id', getJournal);
router.put('/:id', validateJournalUpdate, updateJournal);
router.delete('/:id', deleteJournal);

module.exports = router;
