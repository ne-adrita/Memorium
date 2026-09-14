const { body, validationResult } = require('express-validator');

// Helper to strip HTML tags (for titles etc.)
const stripTags = value => {
  if (typeof value !== 'string') return value;
  return value.replace(/<[^>]*>/g, '');
};

// Safe HTML sanitizer for page content — allows pen-written spans etc. but blocks XSS
const sanitizeContent = value => {
  if (typeof value !== 'string') return value;
  // Remove script/style blocks entirely
  let v = value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  v = v.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const allowedTags = ['p', 'span', 'br', 'div'];
  const allowedProps = [
    'color',
    'background-color',
    'font-family',
    'font-style',
    'font-weight',
    'font-size',
    'line-height',
    'opacity',
    'padding',
    'border-radius',
    'box-decoration-break',
  ];
  const allowedPenIds = [
    'classic-black-ink',
    'royal-blue-ink',
    'burgundy-fountain',
    'forest-green-ink',
    'graphite-pencil',
    'soft-black-gel',
    'golden-highlighter',
    'rose-ink',
    'classic-leather',
    'coffee-brown',
    'walnut',
    'sepia-vintage',
    'rose-blush',
    'dusty-pink',
    'blush',
    'vintage-pink',
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
  ];
  v = v.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (match, tagName, attrs) => {
    tagName = tagName.toLowerCase();
    const isClosing = match.startsWith('</');
    const isSelfClosing = /\/\s*>$/.test(match);
    if (!allowedTags.includes(tagName)) return '';
    if (tagName === 'br') return '<br>';
    if (isClosing) return `</${tagName}>`;
    let sanitizedAttrs = '';
    if (attrs) {
      const attrRegex = /([a-zA-Z0-9:-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g;
      let m;
      while ((m = attrRegex.exec(attrs)) !== null) {
        const name = m[1].toLowerCase();
        const val = m[2].replace(/^["']|["']$/g, '');
        if (name.startsWith('on')) continue;
        if (/javascript:/i.test(val)) continue;
        if (name === 'style') {
          const parts = val
            .split(';')
            .map(s => s.trim())
            .filter(Boolean);
          const clean = [];
          for (const part of parts) {
            const colonIdx = part.indexOf(':');
            if (colonIdx === -1) continue;
            const pName = part.slice(0, colonIdx).trim().toLowerCase();
            const pVal = part.slice(colonIdx + 1).trim();
            if (!allowedProps.includes(pName)) continue;
            if (/url\s*\(/i.test(pVal) || /expression/i.test(pVal) || /javascript:/i.test(pVal))
              continue;
            if (pVal.length > 200) continue;
            clean.push(`${pName}:${pVal}`);
          }
          if (clean.length) sanitizedAttrs += ` style="${clean.join('; ')}"`;
          continue;
        }
        if (name === 'class') {
          if (!/^[a-zA-Z0-9-_ ]+$/.test(val) || val.length > 120) continue;
          const classes = val.split(/\s+/).filter(c => c && /^[a-zA-Z0-9-_]+$/.test(c));
          const allowedClasses = [
            'pen-written',
            'page-paragraph',
            'page-first-letter',
            'page-writing-area',
            'page-number',
          ];
          const filtered = classes.filter(c => allowedClasses.includes(c) || c.startsWith('page-'));
          // Always allow pen-written explicitly
          if (val.split(/\s+/).includes('pen-written') && !filtered.includes('pen-written'))
            filtered.push('pen-written');
          if (filtered.length) sanitizedAttrs += ` class="${filtered.join(' ')}"`;
          continue;
        }
        if (name === 'data-pen' || name === 'data-pen-type') {
          if (/^[a-z0-9-]+$/.test(val) && val.length < 60) {
            // Optionally validate against known pen ids but allow any safe string
            sanitizedAttrs += ` ${name}="${val}"`;
          }
          continue;
        }
        // ignore other attrs (id, etc.)
      }
    }
    if (isSelfClosing && tagName !== 'br') return `<${tagName}${sanitizedAttrs}>`;
    return `<${tagName}${sanitizedAttrs}>`;
  });
  // Final sweep: remove any lingering on*=
  v = v.replace(/\bon\w+\s*=/gi, '');
  return v.trim();
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
  body('themeId')
    .optional()
    .isIn([
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
    ])
    .withMessage('Invalid themeId'),
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
  body('themeId')
    .optional()
    .isIn([
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
    ])
    .withMessage('Invalid themeId'),
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
    .customSanitizer(sanitizeContent),
  body('theme')
    .optional()
    .isIn([
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
    ])
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
    .customSanitizer(sanitizeContent),
  body('theme')
    .optional()
    .isIn([
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
    ])
    .withMessage('Invalid theme'),
  // journal move: validated via controller but also check format
  body('journal').optional().isMongoId().withMessage('Invalid journal ID'),
  handleValidationErrors,
];

module.exports = {
  stripTags,
  sanitizeContent,
  handleValidationErrors,
  validateRegister,
  validateLogin,
  validateJournalCreate,
  validateJournalUpdate,
  validatePageCreate,
  validatePageUpdate,
};
