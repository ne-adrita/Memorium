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

function generateToken(payload) {
  const secret = getSecret();
  const expiresIn = getExpiresIn();
  // payload should be minimal: { userId: ... }
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyToken(token) {
  const secret = getSecret();
  return jwt.verify(token, secret);
}

module.exports = { generateToken, verifyToken, getSecret, getExpiresIn };
