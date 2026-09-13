const express = require('express');
const router = express.Router({ mergeParams: true });
const authMiddleware = require('../middleware/authMiddleware');
const { validatePageCreate, validatePageUpdate } = require('../middleware/validate');
const {
  listPages,
  getPage,
  createPage,
  updatePage,
  deletePage,
} = require('../controllers/pageController');

// All page routes are protected
router.use(authMiddleware);

// Nested under journals: /api/journals/:journalId/pages
router.get('/', listPages);
router.post('/', validatePageCreate, createPage);

// Direct page access: /api/pages/:id (mounted at /api/pages)
router.get('/:id', getPage);
router.put('/:id', validatePageUpdate, updatePage);
router.delete('/:id', deletePage);

module.exports = router;
