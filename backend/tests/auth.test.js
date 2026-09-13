const request = require('supertest');
const { connect, clear, close } = require('./setup');
const { registerUser, loginUser, authHeader, expiredToken } = require('./helpers');

const app = require('../server');

describe('Auth — POST /api/auth/register', () => {
  beforeAll(async () => {
    await connect();
  });
  afterEach(async () => {
    await clear();
  });
  afterAll(async () => {
    await close();
  });

  test('success: creates user and returns token (201)', async () => {
    const res = await registerUser(app, {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'securePass123',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user).toHaveProperty('email', 'ada@example.com');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.user).toHaveProperty('name', 'Ada Lovelace');
  });

  test('duplicate email: 409 Email already registered (case-insensitive)', async () => {
    await registerUser(app, { name: 'First', email: 'dup@example.com', password: 'password123' });
    const res = await registerUser(app, {
      name: 'Second',
      email: 'DUP@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already registered/i);
  });

  test('weak password: <6 chars => 400', async () => {
    const res = await registerUser(app, {
      name: 'Weak',
      email: 'weak@example.com',
      password: '123',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/at least 6/i);
  });

  test('weak password: empty => 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Weak', email: 'weak2@example.com', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  test('invalid email format => 400', async () => {
    const res = await registerUser(app, {
      name: 'Bad Email',
      email: 'not-an-email',
      password: 'password123',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid email/i);
  });

  test('missing name => 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'noname@example.com', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name is required/i);
  });
});

describe('Auth — POST /api/auth/login', () => {
  beforeAll(async () => {
    await connect();
  });
  afterEach(async () => {
    await clear();
  });
  afterAll(async () => {
    await close();
  });

  const user = { name: 'Login User', email: 'login@example.com', password: 'mySecret123' };

  beforeEach(async () => {
    await registerUser(app, user);
  });

  test('success: returns token and sanitized user (200)', async () => {
    const res = await loginUser(app, { email: 'login@example.com', password: 'mySecret123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user).toHaveProperty('email', 'login@example.com');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  test('case-insensitive email: login succeeds', async () => {
    const res = await loginUser(app, { email: 'LOGIN@EXAMPLE.COM', password: 'mySecret123' });
    expect(res.status).toBe(200);
  });

  test('wrong password: 401 Invalid credentials', async () => {
    const res = await loginUser(app, { email: 'login@example.com', password: 'wrongPassword' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });

  test('nonexistent user: 401 Invalid credentials', async () => {
    const res = await loginUser(app, { email: 'nouser@example.com', password: 'whatever123' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });

  test('missing fields: 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'login@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });
});

describe('Auth — GET /api/auth/me', () => {
  beforeAll(async () => {
    await connect();
  });
  afterEach(async () => {
    await clear();
  });
  afterAll(async () => {
    await close();
  });

  test('valid token: returns current user (200)', async () => {
    const reg = await registerUser(app, {
      name: 'Me User',
      email: 'me@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const res = await request(app).get('/api/auth/me').set('Authorization', authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toHaveProperty('email', 'me@example.com');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  test('missing token: 401 Authentication required', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  test('malformed header (no Bearer): 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Token abc');
    expect(res.status).toBe(401);
  });

  test('invalid token string: 401 Invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authHeader('this.is.not.a.valid.token'));
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid token/i);
  });

  test('expired token: 401 Token expired', async () => {
    const reg = await registerUser(app, {
      name: 'Expired',
      email: 'expired@example.com',
      password: 'password123',
    });
    const userId = reg.body.data.user._id;
    const token = expiredToken(userId);
    const res = await request(app).get('/api/auth/me').set('Authorization', authHeader(token));
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/token expired/i);
  });

  test('empty Bearer token: 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
  });
});
