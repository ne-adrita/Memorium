const request = require('supertest');
const jwt = require('jsonwebtoken');

function authHeader(token) {
  return `Bearer ${token}`;
}

function randomIp() {
  // Generate random test IP to avoid rate limiter collisions (e.g., 10.x.x.x)
  return `10.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
}

async function registerUser(app, { name, email, password }, opts = {}) {
  const ip = opts.ip || randomIp();
  const res = await request(app)
    .post('/api/auth/register')
    .set('X-Forwarded-For', ip)
    .send({ name, email, password });
  return res;
}

async function loginUser(app, { email, password }, opts = {}) {
  const ip = opts.ip || randomIp();
  const res = await request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email, password });
  return res;
}

async function createJournal(app, token, data = {}) {
  const payload = {
    title: data.title || 'Test Journal',
    description: data.description || '',
    ...data,
  };
  // Use random IP to avoid general limiter in bulk tests
  const ip = randomIp();
  const res = await request(app)
    .post('/api/journals')
    .set('Authorization', authHeader(token))
    .set('X-Forwarded-For', ip)
    .send(payload);
  return res;
}

async function createPage(app, token, journalId, data = {}) {
  const payload = { pageNumber: data.pageNumber || 1, title: data.title || 'Page', ...data };
  const ip = randomIp();
  const res = await request(app)
    .post(`/api/journals/${journalId}/pages`)
    .set('Authorization', authHeader(token))
    .set('X-Forwarded-For', ip)
    .send(payload);
  return res;
}

function expiredToken(userId) {
  const secret = process.env.JWT_SECRET;
  // exp in the past => TokenExpiredError
  return jwt.sign({ userId, exp: Math.floor(Date.now() / 1000) - 3600 }, secret);
}

module.exports = { authHeader, registerUser, loginUser, createJournal, createPage, expiredToken };
