const { body, validationResult } = require('express-validator');

// Helper to strip HTML tags
const stripTags = value => {
  if (typeof value !== 'string') return value;
  return value.replace(/<[^>]*>/g, '');
};

// Middleware to return 400 with field-level errors
function handleValidationErrors(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const errors = result.array().map(e => ({
      field: e.path,
      message: e.msg,
      value: e.value,
    }));
    // For backward compat, message is first error's message (tests check message regex)
    const firstMsg = errors[0]?.message || 'Validation failed';
    return res.status(400).json({
      success: false,
      message: firstMsg,
      errors,
    });
  }
  next();
}

// Auth validations
const validateRegister = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters')
    .customSanitizer(stripTags)
    .escape(),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail()
    .isLength({ max: 254 })
    .withMessage('Email too long'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .isLength({ max: 128 })
    .withMessage('Password too long'),
  handleValidationErrors,
];

const validateLogin = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 1 })
    .withMessage('Password is required'),
  handleValidationErrors,
];

// Journal validations
const validateJournalCreate = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 120 })
    .withMessage('Title must be at most 120 characters')
    .customSanitizer(stripTags),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters')
    .customSanitizer(stripTags),
  // cover is optional object; not strictly validated here
  handleValidationErrors,
];

const validateJournalUpdate = [
  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Title cannot be empty')
    .isLength({ max: 120 })
    .withMessage('Title must be at most 120 characters')
    .customSanitizer(stripTags),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters')
    .customSanitizer(stripTags),
  handleValidationErrors,
];

// Page validations
const validatePageCreate = [
  body('pageNumber')
    .notEmpty()
    .withMessage('pageNumber is required')
    .isInt({ min: 1 })
    .withMessage('pageNumber must be an integer >= 1')
    .toInt(),
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Title must be at most 200 characters')
    .customSanitizer(stripTags),
  body('content')
    .optional()
    .trim()
    .isLength({ max: 50000 })
    .withMessage('Content too long')
    .customSanitizer(stripTags),
  body('theme')
    .optional()
    .isIn(['parchment', 'vintage', 'aged', 'handwritten'])
    .withMessage('Invalid theme'),
  handleValidationErrors,
];

const validatePageUpdate = [
  body('pageNumber')
    .optional()
    .isInt({ min: 1 })
    .withMessage('pageNumber must be integer >=1')
    .toInt(),
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Title must be at most 200 characters')
    .customSanitizer(stripTags),
  body('content')
    .optional()
    .trim()
    .isLength({ max: 50000 })
    .withMessage('Content too long')
    .customSanitizer(stripTags),
  body('theme')
    .optional()
    .isIn(['parchment', 'vintage', 'aged', 'handwritten'])
    .withMessage('Invalid theme'),
  // journal move: validated via controller but also check format
  body('journal').optional().isMongoId().withMessage('Invalid journal ID'),
  handleValidationErrors,
];

module.exports = {
  stripTags,
  handleValidationErrors,
  validateRegister,
  validateLogin,
  validateJournalCreate,
  validateJournalUpdate,
  validatePageCreate,
  validatePageUpdate,
};
