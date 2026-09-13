const express = require('express');
const router = express.Router({ mergeParams: true });
const authMiddleware = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');
const {
  uploadImage,
  getImage,
  updateImage,
  deleteImage,
  listImagesByPage,
} = require('../controllers/imageController');

// All image routes protected
router.use(authMiddleware);

// Nested: POST /api/pages/:pageId/images and GET /api/pages/:pageId/images
// When mounted at /api/pages/:pageId/images, req.params.pageId will be set
router.post('/', (req, res, next) => {
  // Need pageId from params
  if (!req.params.pageId) {
    // This is direct mount at /api/images, not nested — skip
    return next();
  }
  // Use multer single file field "image"
  upload.single('image')(req, res, (err) => {
    if (err) {
      // Handle multer errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'Image too large. Max 5 MB' });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
    return uploadImage(req, res, next);
  });
});

router.get('/', (req, res, next) => {
  if (!req.params.pageId) return next();
  return listImagesByPage(req, res, next);
});

// Direct: GET /api/images/:id, PUT /api/images/:id and DELETE /api/images/:id
// When mounted at /api/images, req.params.id will be set
router.get('/:id', getImage);
router.put('/:id', updateImage);
router.delete('/:id', deleteImage);

module.exports = router;
