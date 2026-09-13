const jwt = require('jsonwebtoken');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret.trim();
}

function getExpiresIn() {
  return (process.env.JWT_EXPIRES_IN || '7d').trim();
}

function getAccessExpiresIn() {
  if (process.env.JWT_ACCESS_EXPIRES_IN) return process.env.JWT_ACCESS_EXPIRES_IN.trim();
  // default 15 minutes per spec
  return '15m';
}

function getRefreshExpiresIn() {
  if (process.env.JWT_REFRESH_EXPIRES_IN) return process.env.JWT_REFRESH_EXPIRES_IN.trim();
  // fallback to JWT_EXPIRES_IN for backward compat, then 7d
  return (process.env.JWT_EXPIRES_IN || '7d').trim();
}

function generateToken(payload) {
  const secret = getSecret();
  const expiresIn = getExpiresIn();
  // payload should be minimal: { userId: ... }
  return jwt.sign(payload, secret, { expiresIn });
}

function generateAccessToken(userId) {
  const secret = getSecret();
  const expiresIn = getAccessExpiresIn();
  return jwt.sign({ userId, tokenType: 'access' }, secret, { expiresIn });
}

function generateRefreshToken(userId) {
  const secret = getSecret();
  const expiresIn = getRefreshExpiresIn();
  const jti = require('crypto').randomBytes(16).toString('hex');
  return jwt.sign({ userId, tokenType: 'refresh', jti }, secret, { expiresIn });
}

function verifyToken(token) {
  const secret = getSecret();
  return jwt.verify(token, secret);
}

// Hash refresh token for storage (sha256 hex)
function hashToken(token) {
  return require('crypto').createHash('sha256').update(token).digest('hex');
}

module.exports = {
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  getSecret,
  getExpiresIn,
  getAccessExpiresIn,
  getRefreshExpiresIn,
  hashToken,
};
