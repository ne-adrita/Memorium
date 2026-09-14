const express = require('express');
const router = express.Router({ mergeParams: true });
const authMiddleware = require('../middleware/authMiddleware');
const { validateDecorationCreate, validateDecorationUpdate } = require('../middleware/validate');
const {
  listDecorations,
  createDecoration,
  updateDecoration,
  deleteDecoration,
  getDecoration,
} = require('../controllers/decorationController');

// All decoration routes are protected
router.use(authMiddleware);

// Nested under pages: /api/pages/:pageId/decorations
router.get('/', listDecorations);
router.post('/', validateDecorationCreate, createDecoration);

// Direct: /api/decorations/:id
router.get('/:id', getDecoration);
router.put('/:id', validateDecorationUpdate, updateDecoration);
router.delete('/:id', deleteDecoration);

module.exports = router;
