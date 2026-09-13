const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

let mongod;

/**
 * Start in-memory Mongo and connect mongoose.
 * Called in beforeAll of each test suite.
 */
async function connect() {
  // Ensure env is set even if env.setup.js was not run (e.g., direct node invocation)
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret-for-memorium-integration-tests-32chars-!!!';
  }
  if (!process.env.JWT_EXPIRES_IN) process.env.JWT_EXPIRES_IN = '1h';
  process.env.NODE_ENV = 'test';

  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  // Disconnect any prior Atlas connection (server.js may have left a closed connection)
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
    } catch (_) {}
  }
  await mongoose.connect(uri, { autoIndex: true });
}

async function clear() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    try {
      await collections[key].deleteMany({});
    } catch (_) {}
  }
  // Clean uploaded files created by image tests (keep .gitkeep)
  const uploadDir = path.join(__dirname, '..', 'uploads', 'images');
  if (fs.existsSync(uploadDir)) {
    for (const file of fs.readdirSync(uploadDir)) {
      if (file === '.gitkeep') continue;
      try {
        fs.unlinkSync(path.join(uploadDir, file));
      } catch (_) {}
    }
  }
}

async function close() {
  try {
    await mongoose.connection.dropDatabase();
  } catch (_) {}
  try {
    await mongoose.connection.close();
  } catch (_) {}
  if (mongod) {
    try {
      await mongod.stop();
    } catch (_) {}
    mongod = null;
  }
}

module.exports = { connect, clear, close, getMongod: () => mongod };
