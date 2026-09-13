const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const {
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  hashToken,
} = require('../config/jwt');
const { asyncHandler } = require('../utils/helper');

const SALT_ROUNDS = 10;

function sanitizeUser(userDoc) {
  const obj = userDoc.toJSON ? userDoc.toJSON() : userDoc;
  // toJSON already removes passwordHash via schema transform, but ensure
  if (obj.passwordHash) delete obj.passwordHash;
  return obj;
}

function setRefreshCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  // 7 days in ms
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'Lax',
    maxAge,
    path: '/',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
  });
}

async function storeRefreshToken(userId, refreshToken) {
  const hash = hashToken(refreshToken);
  // Decode exp for expiresAt
  const decoded = jwt.decode(refreshToken);
  const expiresAt =
    decoded && decoded.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ user: userId, tokenHash: hash, expiresAt });
}

const register = asyncHandler(async (req, res) => {
  let { name, email, password } = req.body;

  if (!name || !name.trim())
    return res.status(400).json({ success: false, message: 'Name is required' });
  if (!email || !email.trim())
    return res.status(400).json({ success: false, message: 'Email is required' });
  if (!password) return res.status(400).json({ success: false, message: 'Password is required' });

  name = name.trim();
  email = email.trim().toLowerCase();
  // basic email format check (also schema regex)
  if (!/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ success: false, message: 'Invalid email format' });
  if (name.length < 2 || name.length > 50)
    return res.status(400).json({ success: false, message: 'Name must be 2-50 characters' });
  if (password.length < 6)
    return res
      .status(400)
      .json({ success: false, message: 'Password must be at least 6 characters' });
  if (password.length > 128)
    return res.status(400).json({ success: false, message: 'Password too long' });

  const existing = await User.findOne({ email });
  if (existing)
    return res.status(409).json({ success: false, message: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ name, email, passwordHash });

  // Issue short-lived access token + long-lived refresh token (httpOnly cookie)
  const accessToken = generateAccessToken(user._id.toString());
  const refreshToken = generateRefreshToken(user._id.toString());
  await storeRefreshToken(user._id, refreshToken);
  setRefreshCookie(res, refreshToken);

  res.status(201).json({
    success: true,
    data: { user: sanitizeUser(user), token: accessToken, accessToken, refreshToken: undefined },
  });
});

const login = asyncHandler(async (req, res) => {
  let { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: 'Email and password are required' });

  email = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ success: false, message: 'Invalid email format' });

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  const accessToken = generateAccessToken(user._id.toString());
  const refreshToken = generateRefreshToken(user._id.toString());
  await storeRefreshToken(user._id, refreshToken);
  setRefreshCookie(res, refreshToken);

  // fetch safe user (without hash) for response
  const safeUser = await User.findById(user._id);
  res.json({
    success: true,
    data: { user: sanitizeUser(safeUser), token: accessToken, accessToken },
  });
});

const me = asyncHandler(async (req, res) => {
  // req.user set by authMiddleware
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: { user: sanitizeUser(user) } });
});

const refresh = asyncHandler(async (req, res) => {
  // Accept refreshToken from httpOnly cookie or JSON body (for tests / mobile)
  const raw =
    (req.cookies && req.cookies.refreshToken) || req.body?.refreshToken || req.body?.refresh_token;
  if (!raw) {
    return res.status(401).json({ success: false, message: 'Refresh token required' });
  }

  let decoded;
  try {
    decoded = verifyToken(raw);
  } catch (err) {
    const msg =
      err.name === 'TokenExpiredError' ? 'Refresh token expired' : 'Invalid refresh token';
    return res.status(401).json({ success: false, message: msg });
  }

  if (decoded.tokenType !== 'refresh') {
    return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }

  const userId = decoded.userId || decoded.id;
  if (!userId)
    return res.status(401).json({ success: false, message: 'Invalid refresh token payload' });

  const hash = hashToken(raw);
  const stored = await RefreshToken.findOne({ tokenHash: hash, revoked: false });
  if (!stored) {
    return res.status(401).json({ success: false, message: 'Refresh token revoked' });
  }
  if (stored.expiresAt && stored.expiresAt < new Date()) {
    await RefreshToken.deleteOne({ _id: stored._id });
    return res.status(401).json({ success: false, message: 'Refresh token expired' });
  }
  // Optional: ensure user still exists
  const user = await User.findById(userId);
  if (!user) {
    await RefreshToken.deleteOne({ _id: stored._id });
    return res.status(401).json({ success: false, message: 'User not found' });
  }

  // Rotate refresh token: delete old, issue new
  await RefreshToken.deleteOne({ _id: stored._id });

  const newAccessToken = generateAccessToken(userId.toString());
  const newRefreshToken = generateRefreshToken(userId.toString());
  await storeRefreshToken(userId, newRefreshToken);
  setRefreshCookie(res, newRefreshToken);

  res.json({ success: true, data: { token: newAccessToken, accessToken: newAccessToken } });
});

const logout = asyncHandler(async (req, res) => {
  const raw =
    (req.cookies && req.cookies.refreshToken) || req.body?.refreshToken || req.body?.refresh_token;
  if (raw) {
    try {
      const hash = hashToken(raw);
      await RefreshToken.deleteOne({ tokenHash: hash });
    } catch (_) {}
  } else {
    // If logout called with access token auth, revoke all refresh tokens for user?
    // Try to get user from auth header if present
    const header = req.headers.authorization || req.headers.Authorization;
    if (header && header.startsWith('Bearer ')) {
      try {
        const decoded = verifyToken(header.slice(7).trim());
        if (decoded.userId) {
          await RefreshToken.deleteMany({ user: decoded.userId });
        }
      } catch (_) {}
    }
  }
  clearRefreshCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

module.exports = { register, login, me, refresh, logout };
