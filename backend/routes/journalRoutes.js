const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
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
router.post('/', createJournal);
router.get('/:id', getJournal);
router.put('/:id', updateJournal);
router.delete('/:id', deleteJournal);

module.exports = router;
