// Sets test env BEFORE app is imported (via jest setupFiles).
// Ensures tests never hit Atlas and have deterministic JWT secret.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-memorium-integration-tests-32chars-!!!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.PORT = '3001';
// Explicitly unset Atlas URI so connectDB is never accidentally called;
// mongodb-memory-server URI will be used instead via mongoose.connect().
delete process.env.MONGO_URI;
process.env.FRONTEND_URL = '';
delete process.env.SERVE_FRONTEND;
process.env.STORAGE_DRIVER = 'local';
