const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generateToken } = require('../config/jwt');
const { asyncHandler } = require('../utils/helper');

const SALT_ROUNDS = 10;

function sanitizeUser(userDoc) {
  const obj = userDoc.toJSON ? userDoc.toJSON() : userDoc;
  // toJSON already removes passwordHash via schema transform, but ensure
  if (obj.passwordHash) delete obj.passwordHash;
  return obj;
}

const register = asyncHandler(async (req, res) => {
  let { name, email, password } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
  if (!email || !email.trim()) return res.status(400).json({ success: false, message: 'Email is required' });
  if (!password) return res.status(400).json({ success: false, message: 'Password is required' });

  name = name.trim();
  email = email.trim().toLowerCase();
  // basic email format check (also schema regex)
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ success: false, message: 'Invalid email format' });
  if (name.length < 2 || name.length > 50) return res.status(400).json({ success: false, message: 'Name must be 2-50 characters' });
  if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  if (password.length > 128) return res.status(400).json({ success: false, message: 'Password too long' });

  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ name, email, passwordHash });

  const token = generateToken({ userId: user._id.toString() });

  res.status(201).json({ success: true, data: { user: sanitizeUser(user), token } });
});

const login = asyncHandler(async (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });

  email = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ success: false, message: 'Invalid email format' });

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  const token = generateToken({ userId: user._id.toString() });

  // fetch safe user (without hash) for response
  const safeUser = await User.findById(user._id);
  res.json({ success: true, data: { user: sanitizeUser(safeUser), token } });
});

const me = asyncHandler(async (req, res) => {
  // req.user set by authMiddleware
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: { user: sanitizeUser(user) } });
});

module.exports = { register, login, me };
