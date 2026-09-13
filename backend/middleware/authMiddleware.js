const { verifyToken } = require('../config/jwt');

/**
 * JWT authentication middleware
 * Expects: Authorization: Bearer <token>
 * On success: req.user = { id: userId }
 * On failure: 401
 */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const token = header.slice(7).trim();
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  try {
    const decoded = verifyToken(token);
    // payload is { userId: ... } per authController
    const userId = decoded.userId || decoded.id || decoded._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Invalid token payload' });
    }
    req.user = { id: userId };
    // For compatibility with future richer payload, keep raw decoded
    req.tokenPayload = decoded;
    next();
  } catch (err) {
    if (err.message === 'JWT_SECRET is not configured') {
      return res.status(500).json({ success: false, message: 'Server JWT not configured' });
    }
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ success: false, message: msg });
  }
}

module.exports = authMiddleware;
