const mongoose = require('mongoose');

/**
 * Connect to MongoDB Atlas
 * Reads connection string from process.env.MONGO_URI
 * Never hard-code credentials in source code.
 */
async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('MONGO_URI is not defined in environment variables');
    throw new Error('MONGO_URI missing');
  }

  // Trim accidental spaces (e.g., "MONGO_URI= mongodb://...")
  const cleanUri = uri.trim();

  try {
    const conn = await mongoose.connect(cleanUri, {
      // Mongoose 7+ ignores these but kept for clarity
      autoIndex: true,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
}

module.exports = connectDB;
