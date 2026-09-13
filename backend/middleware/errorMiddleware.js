/**
 * Centralized error handler
 * Handles: invalid ObjectId (CastError), validation errors, duplicate keys, not found
 * Returns consistent JSON without exposing stack/credentials
 */
function errorMiddleware(err, req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Mongoose bad ObjectId
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    status = 400;
    message = `Invalid ID format: ${err.value}`;
  }

  // Mongoose validation
  if (err.name === 'ValidationError') {
    status = 400;
    const details = Object.values(err.errors).map((e) => e.message);
    message = details.join(', ');
  }

  // Duplicate key (e.g., unique email, pageNumber per journal)
  if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {}).join(', ') || 'field';
    message = `Duplicate value for ${field}`;
  }

  // Handle CORS rejection specifically (origin callback error)
  if (message === 'Not allowed by CORS') {
    status = 403;
  }
  // Hide internal details in production
  if (status === 500 && process.env.NODE_ENV === 'production') {
    // Allow known safe messages through (CORS)
    const safePatterns = ['Not allowed by CORS'];
    const isSafe = safePatterns.some((p) => message.includes(p));
    if (!isSafe) {
      const isKnownSafe = err.statusCode && err.statusCode < 500;
      if (!isKnownSafe) message = 'Internal server error';
    }
  }
  // Strip any accidental secret leakage
  if (/mongo/i.test(message) && message.includes('://')) {
    message = 'Database error';
  }
  if (/JWT_SECRET/i.test(message)) {
    message = 'Server configuration error';
  }

  const response = { success: false, message };
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    // only include stack when explicitly debugging; still not credentials
    // response.stack = err.stack;
  }

  res.status(status).json(response);
}

module.exports = errorMiddleware;
