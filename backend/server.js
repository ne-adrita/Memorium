require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const journalRoutes = require('./routes/journalRoutes');
const pageRoutes = require('./routes/pageRoutes');
const decorationRoutes = require('./routes/decorationRoutes');
const imageRoutes = require('./routes/imageRoutes');
const errorMiddleware = require('./middleware/errorMiddleware');

const app = express();

// Trust proxy for Render/Railway/Heroku
app.set('trust proxy', 1);

// CORS — allow FRONTEND_URL in production, permissive in development
const frontendUrl = (process.env.FRONTEND_URL || '').trim();
const allowedOrigins = frontendUrl
  ? frontendUrl.split(',').map((s) => s.trim()).filter(Boolean)
  : [];

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests (curl, health checks, same-origin)
      if (!origin) return callback(null, true);
      // If no FRONTEND_URL configured, allow all origins in development only
      if (allowedOrigins.length === 0) {
        if (process.env.NODE_ENV === 'production') {
          // In production without FRONTEND_URL, allow origin but warn
          console.warn('[CORS] FRONTEND_URL not set — allowing origin:', origin);
        }
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow localhost for local dev even when FRONTEND_URL is set
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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

// Optionally serve frontend static files when SERVE_FRONTEND=true
// This allows single-service deployment (backend serves frontend).
// For separate frontend hosting (e.g., Netlify), leave SERVE_FRONTEND unset.
const serveFrontend = String(process.env.SERVE_FRONTEND || '').toLowerCase() === 'true';
const frontendPath = path.join(__dirname, '..', 'frontend');
let frontendServed = false;
if (serveFrontend && fs.existsSync(frontendPath)) {
  const frontendIndex = path.join(frontendPath, 'index.html');
  if (fs.existsSync(frontendIndex)) {
    app.use(express.static(frontendPath, { maxAge: '1d', etag: true }));
    // SPA-style fallback for frontend routes (but not API)
    app.get(/^\/(?!api\/).*/, (req, res, next) => {
      // If file exists, static already served. Otherwise serve index.html for known frontend pages
      const filePath = path.join(frontendPath, req.path);
      // Prevent directory traversal — ensure resolved path is inside frontendPath
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(frontendPath))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      // If request looks like an API miss, let 404 handler decide
      if (req.path.startsWith('/api/')) return next();
      // If extension present and file doesn't exist, 404
      if (path.extname(req.path) && !fs.existsSync(resolved)) {
        return res.status(404).json({ success: false, message: 'Not found' });
      }
      // Serve index.html for frontend routes without extension, or fallback
      if (!path.extname(req.path)) {
        return res.sendFile(frontendIndex);
      }
      return next();
    });
    frontendServed = true;
    console.log('[static] Serving frontend from', frontendPath);
  }
}

// 404 for unknown API routes (and non-frontend routes)
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Centralized error handler
app.use(errorMiddleware);

const PORT = (process.env.PORT || '3000').toString().trim();

async function start() {
  try {
    await connectDB();
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Memorium API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
      if (frontendServed) console.log('Frontend static serving: enabled');
      if (frontendUrl) console.log('Allowed CORS origins:', allowedOrigins.join(', '));
      else console.log('CORS: FRONTEND_URL not set — permissive in dev, warn in prod');
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        try {
          await mongoose.connection.close();
          console.log('MongoDB connection closed');
        } catch (_) {}
        process.exit(0);
      });
      // Force exit after 10s
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle unhandled rejections without leaking internals
    process.on('unhandledRejection', (err) => {
      console.error('Unhandled rejection:', err && err.message ? err.message : err);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    if (process.env.NODE_ENV === 'production') {
      // Avoid leaking details, but log minimal
      console.error('Startup failed — check MONGO_URI and JWT_SECRET');
    }
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;
