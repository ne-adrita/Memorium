const request = require('supertest');
const { connect, clear, close } = require('./setup');
const { registerUser, authHeader } = require('./helpers');

const app = require('../server');

describe('Input sanitization & validation', () => {
  beforeAll(async () => {
    await connect();
  });
  afterEach(async () => {
    await clear();
  });
  afterAll(async () => {
    await close();
  });

  test('register: invalid email format returns 400 with field-level errors', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set(
        'X-Forwarded-For',
        `10.${Date.now() % 255}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
      )
      .send({ name: 'Test', email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty('errors');
    expect(Array.isArray(res.body.errors)).toBe(true);
    const emailErr = res.body.errors.find(e => e.field === 'email');
    expect(emailErr).toBeDefined();
    expect(emailErr.message).toMatch(/invalid email/i);
    expect(res.body.message).toMatch(/invalid email/i);
  });

  test('register: password too short returns 400 with errors', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set(
        'X-Forwarded-For',
        `10.${Date.now() % 255}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
      )
      .send({ name: 'Test', email: 'valid@example.com', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    const pw = res.body.errors.find(e => e.field === 'password');
    expect(pw).toBeDefined();
    expect(pw.message).toMatch(/at least 6/i);
  });

  test('register: missing name returns 400 with field errors', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set(
        'X-Forwarded-For',
        `10.${Date.now() % 255}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
      )
      .send({ email: 'a@example.com', password: 'password123' });
    expect(res.status).toBe(400);
    const nameErr = res.body.errors.find(e => e.field === 'name');
    expect(nameErr).toBeDefined();
  });

  test('login: missing password returns 400 with errors', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(
        'X-Forwarded-For',
        `10.${Date.now() % 255}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
      )
      .send({ email: 'a@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  test('journal: title with HTML tags is sanitized (stripped)', async () => {
    const reg = await registerUser(app, {
      name: 'Val',
      email: 'val@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const res = await request(app)
      .post('/api/journals')
      .set('Authorization', authHeader(token))
      .send({ title: '<script>alert(1)</script>My Journal', description: '<b>bold</b> desc' });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('alert(1)My Journal'); // stripTags removes <script> but keeps inner text
    expect(res.body.data.title).not.toMatch(/<[^>]*>/);
    expect(res.body.data.description).toBe('bold desc');
    expect(res.body.data.description).not.toMatch(/<[^>]*>/);

    // Verify persisted
    const get = await request(app)
      .get(`/api/journals/${res.body.data._id}`)
      .set('Authorization', authHeader(token));
    expect(get.body.data.title).not.toMatch(/<script/i);
  });

  test('journal: title too long (>120) returns 400', async () => {
    const reg = await registerUser(app, {
      name: 'Val2',
      email: 'val2@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const long = 'a'.repeat(121);
    const res = await request(app)
      .post('/api/journals')
      .set('Authorization', authHeader(token))
      .send({ title: long });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    const err = res.body.errors.find(e => e.field === 'title');
    expect(err).toBeDefined();
  });

  test('journal: description too long (>500) returns 400', async () => {
    const reg = await registerUser(app, {
      name: 'Val3',
      email: 'val3@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const long = 'a'.repeat(501);
    const res = await request(app)
      .post('/api/journals')
      .set('Authorization', authHeader(token))
      .send({ title: 'ok', description: long });
    expect(res.status).toBe(400);
  });

  test('page: content HTML tags are stripped', async () => {
    const reg = await registerUser(app, {
      name: 'PageVal',
      email: 'pageval@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const j = await request(app)
      .post('/api/journals')
      .set('Authorization', authHeader(token))
      .send({ title: 'J' });
    const jid = j.body.data._id;
    const res = await request(app)
      .post(`/api/journals/${jid}/pages`)
      .set('Authorization', authHeader(token))
      .send({
        pageNumber: 1,
        title: '<h1>Title</h1>',
        content: '<p>Hello <img src=x onerror=alert(1)> world</p>',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.title).not.toMatch(/<[^>]*>/);
    // Content now allows safe HTML (p, span.pen-written, br) but strips dangerous tags like img/onerror
    expect(res.body.data.content).not.toMatch(/<img/i);
    expect(res.body.data.content).not.toMatch(/onerror/i);
    expect(res.body.data.content).toMatch(/Hello/);
    expect(res.body.data.content).toMatch(/world/);
    expect(res.body.data.title).toBe('Title');
  });

  test('page: invalid pageNumber returns 400 with errors', async () => {
    const reg = await registerUser(app, {
      name: 'PageVal2',
      email: 'pageval2@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const j = await request(app)
      .post('/api/journals')
      .set('Authorization', authHeader(token))
      .send({ title: 'J2' });
    const res = await request(app)
      .post(`/api/journals/${j.body.data._id}/pages`)
      .set('Authorization', authHeader(token))
      .send({ pageNumber: 0 });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  test('page: invalid theme returns 400', async () => {
    const reg = await registerUser(app, {
      name: 'PageVal3',
      email: 'pageval3@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const j = await request(app)
      .post('/api/journals')
      .set('Authorization', authHeader(token))
      .send({ title: 'J3' });
    const res = await request(app)
      .post(`/api/journals/${j.body.data._id}/pages`)
      .set('Authorization', authHeader(token))
      .send({ pageNumber: 1, theme: 'invalidTheme' });
    expect(res.status).toBe(400);
  });

  test('page update: HTML tags stripped on update', async () => {
    const reg = await registerUser(app, {
      name: 'Upd',
      email: 'upd@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const j = await request(app)
      .post('/api/journals')
      .set('Authorization', authHeader(token))
      .send({ title: 'J4' });
    const p = await request(app)
      .post(`/api/journals/${j.body.data._id}/pages`)
      .set('Authorization', authHeader(token))
      .send({ pageNumber: 1, title: 'orig' });
    const pid = p.body.data._id;
    const upd = await request(app)
      .put(`/api/pages/${pid}`)
      .set('Authorization', authHeader(token))
      .send({ title: '<b>New</b>' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.title).toBe('New');
  });
});
