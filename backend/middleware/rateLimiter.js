const rateLimit = require('express-rate-limit');

// General limiter: 100 req / 15 min per IP (higher in test to avoid flakiness)
const isTest = process.env.NODE_ENV === 'test';
const generalMax = isTest ? 1000 : 100;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: generalMax,
  standardHeaders: true,
  legacyHeaders: false,
  // Use IP as key; respect trust proxy
  keyGenerator: req => req.ip || req.headers['x-forwarded-for'] || 'unknown',
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later.',
    });
  },
  // Skip health check? keep but allow — health is used for monitoring
  skip: req => req.path === '/api/health',
});

// Strict limiter for auth: 5 attempts / 15 min per IP (higher in test to avoid existing tests flaking;
// rateLimit.test.js uses a dedicated app with limit 5 to verify behavior)
const authMax = isTest ? 1000 : 5;
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: authMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.ip || req.headers['x-forwarded-for'] || 'unknown',
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again in 15 minutes.',
    });
  },
});

module.exports = { apiLimiter, authLimiter };
