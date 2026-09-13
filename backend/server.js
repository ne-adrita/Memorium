require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const journalRoutes = require('./routes/journalRoutes');
const pageRoutes = require('./routes/pageRoutes');
const decorationRoutes = require('./routes/decorationRoutes');
const imageRoutes = require('./routes/imageRoutes');
const errorMiddleware = require('./middleware/errorMiddleware');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check — indicates API running and DB status (no secrets)
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    success: true,
    message: 'Memorium API is running',
    db: dbStatus,
    uptime: process.uptime(),
  });
});

// Auth routes (public + protected me)
app.use('/api/auth', authRoutes);

// Protected resources — authMiddleware applied inside routers
app.use('/api/journals', journalRoutes);
app.use('/api/journals/:journalId/pages', pageRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/pages/:pageId/decorations', decorationRoutes);
app.use('/api/decorations', decorationRoutes);
app.use('/api/pages/:pageId/images', imageRoutes);
app.use('/api/images', imageRoutes);

// 404 for unknown API routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Centralized error handler
app.use(errorMiddleware);

const PORT = (process.env.PORT || '3000').toString().trim();

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Memorium API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;
