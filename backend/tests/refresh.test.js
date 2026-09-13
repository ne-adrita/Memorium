const request = require('supertest');
const jwt = require('jsonwebtoken');
const { connect, clear, close } = require('./setup');
const { registerUser, authHeader } = require('./helpers');
const RefreshToken = require('../models/RefreshToken');
const { hashToken } = require('../config/jwt');

const app = require('../server');

function getRefreshCookie(res) {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return null;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const refresh = cookies.find(c => c.includes('refreshToken='));
  if (!refresh) return null;
  const match = refresh.match(/refreshToken=([^;]+)/);
  return match ? match[1] : null;
}

describe('Refresh tokens', () => {
  beforeAll(async () => {
    await connect();
  });
  afterEach(async () => {
    await clear();
  });
  afterAll(async () => {
    await close();
  });

  test('register sets httpOnly refresh cookie and returns short-lived access token (15m)', async () => {
    const res = await registerUser(app, {
      name: 'Ref1',
      email: 'ref1@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('token');
    const accessToken = res.body.data.token;
    const decoded = jwt.decode(accessToken);
    expect(decoded.tokenType).toBe('access');
    // exp - iat should be ~15min (900s)
    const diff = decoded.exp - decoded.iat;
    expect(diff).toBeGreaterThanOrEqual(14 * 60);
    expect(diff).toBeLessThanOrEqual(16 * 60);

    const cookie = getRefreshCookie(res);
    expect(cookie).toBeTruthy();
    const refreshDecoded = jwt.decode(cookie);
    expect(refreshDecoded.tokenType).toBe('refresh');
    const rDiff = refreshDecoded.exp - refreshDecoded.iat;
    expect(rDiff).toBeGreaterThanOrEqual(6 * 24 * 60 * 60);
    expect(rDiff).toBeLessThanOrEqual(8 * 24 * 60 * 60);

    // Check Set-Cookie attributes
    const setCookie = res.headers['set-cookie'].find(c => c.includes('refreshToken='));
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//i);

    // DB stores hash, not plain
    const hash = hashToken(cookie);
    const stored = await RefreshToken.findOne({ tokenHash: hash });
    expect(stored).toBeTruthy();
    expect(stored.tokenHash).not.toBe(cookie);
    expect(stored.user.toString()).toBe(res.body.data.user._id);
  });

  test('login also sets refresh cookie', async () => {
    await registerUser(app, {
      name: 'RefLogin',
      email: 'reflogin@example.com',
      password: 'password123',
    });
    // Need new IP to avoid rate limit? helpers use random, but we use direct request for login with same IP?
    // Use helper loginUser which uses random IP
    const agent = request.agent(app);
    // Register via agent to get cookie
    await agent
      .post('/api/auth/register')
      .send({ name: 'Agent', email: 'agent@example.com', password: 'password123' });
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ email: 'agent@example.com', password: 'password123' });
    expect(loginRes.status).toBe(200);
    const cookie = getRefreshCookie(loginRes);
    expect(cookie).toBeTruthy();
  });

  test('POST /api/auth/refresh with valid cookie returns new access token and rotates refresh', async () => {
    const agent = request.agent(app);
    const reg = await agent
      .post('/api/auth/register')
      .send({ name: 'RefreshUser', email: 'r@example.com', password: 'password123' });
    const oldCookie = getRefreshCookie(reg);
    expect(oldCookie).toBeTruthy();
    const oldHash = hashToken(oldCookie);
    expect(await RefreshToken.findOne({ tokenHash: oldHash })).toBeTruthy();

    const refreshRes = await agent.post('/api/auth/refresh');
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data).toHaveProperty('token');
    const newAccess = refreshRes.body.data.token;
    const decoded = jwt.decode(newAccess);
    expect(decoded.tokenType).toBe('access');

    const newCookie = getRefreshCookie(refreshRes);
    expect(newCookie).toBeTruthy();
    expect(newCookie).not.toBe(oldCookie);

    // Old hash should be deleted (revoked)
    expect(await RefreshToken.findOne({ tokenHash: oldHash })).toBeNull();
    const newHash = hashToken(newCookie);
    expect(await RefreshToken.findOne({ tokenHash: newHash })).toBeTruthy();
  });

  test('refresh with body token also works (no cookie)', async () => {
    const reg = await registerUser(app, {
      name: 'BodyRef',
      email: 'bodyref@example.com',
      password: 'password123',
    });
    const cookie = getRefreshCookie(reg);
    // Use plain request with body
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: cookie });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  test('refresh with invalid token => 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid.token.here' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  test('refresh with missing token => 401', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/required/i);
  });

  test('refresh with expired token => 401', async () => {
    // Create an expired refresh token manually
    const secret = process.env.JWT_SECRET;
    const expired = jwt.sign({ userId: '000000000000000000000000', tokenType: 'refresh' }, secret, {
      expiresIn: '0s',
    });
    // Wait a bit to ensure expired
    await new Promise(r => setTimeout(r, 1000));
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: expired });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  test('refresh with revoked token fails (reuse old after rotation)', async () => {
    const agent = request.agent(app);
    const reg = await agent
      .post('/api/auth/register')
      .send({ name: 'Reuse', email: 'reuse@example.com', password: 'password123' });
    const oldCookie = getRefreshCookie(reg);
    await agent.post('/api/auth/refresh'); // rotates
    // Try reuse old
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: oldCookie });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/revoked/i);
  });

  test('refresh token cannot be used as access token for protected route', async () => {
    const reg = await registerUser(app, {
      name: 'NoAccess',
      email: 'noaccess@example.com',
      password: 'password123',
    });
    const refreshCookie = getRefreshCookie(reg);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshCookie}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid token/i);
  });

  test('access token cannot be used to refresh (tokenType mismatch)', async () => {
    const reg = await registerUser(app, {
      name: 'AccRef',
      email: 'accref@example.com',
      password: 'password123',
    });
    const access = reg.body.data.token;
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: access });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  test('POST /api/auth/logout revokes and clears cookie, subsequent refresh fails', async () => {
    const agent = request.agent(app);
    const reg = await agent
      .post('/api/auth/register')
      .send({ name: 'Logout', email: 'logout@example.com', password: 'password123' });
    const cookie = getRefreshCookie(reg);
    const hash = hashToken(cookie);
    expect(await RefreshToken.findOne({ tokenHash: hash })).toBeTruthy();

    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);
    // Cookie cleared: Set-Cookie with empty value or expires
    const cleared = logoutRes.headers['set-cookie']?.find(c => c.includes('refreshToken='));
    expect(cleared).toBeTruthy();
    // After logout, hash should be gone
    expect(await RefreshToken.findOne({ tokenHash: hash })).toBeNull();

    // Try refresh with old cookie (agent still sends old cookie? but we cleared, so need manual)
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: cookie });
    expect(res.status).toBe(401);
  });

  test('logout without cookie still succeeds (idempotent)', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(200);
  });

  test('access token expires after 15m: expired access returns 401, refresh still works', async () => {
    const agent = request.agent(app);
    const reg = await agent
      .post('/api/auth/register')
      .send({ name: 'Exp', email: 'exp@example.com', password: 'password123' });
    const userId = reg.body.data.user._id;
    // Create expired access token
    const secret = process.env.JWT_SECRET;
    const expiredAccess = jwt.sign(
      { userId, tokenType: 'access', exp: Math.floor(Date.now() / 1000) - 10 },
      secret
    );
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredAccess}`);
    expect(meRes.status).toBe(401);
    expect(meRes.body.message).toMatch(/expired/i);

    // Refresh should still work via cookie
    const refreshRes = await agent.post('/api/auth/refresh');
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.token).toBeTruthy();
  });

  test('multiple refresh rotations work and old hashes are removed', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ name: 'Multi', email: 'multi@example.com', password: 'password123' });
    for (let i = 0; i < 3; i++) {
      const r = await agent.post('/api/auth/refresh');
      expect(r.status).toBe(200);
    }
    // There should be exactly 1 refresh token in DB for this user (the latest)
    const user = await require('../models/User').findOne({ email: 'multi@example.com' });
    const count = await RefreshToken.countDocuments({ user: user._id });
    expect(count).toBe(1);
  });
});
