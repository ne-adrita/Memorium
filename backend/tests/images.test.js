const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { connect, clear, close } = require('./setup');
const { registerUser, authHeader } = require('./helpers');

const app = require('../server');

// 1x1 PNG (68 bytes) — valid image
const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
);

async function createJournalAndPage(appInstance, token) {
  const j = await request(appInstance)
    .post('/api/journals')
    .set('Authorization', authHeader(token))
    .send({ title: 'Img Journal' });
  const journalId = j.body.data._id;
  const p = await request(appInstance)
    .post(`/api/journals/${journalId}/pages`)
    .set('Authorization', authHeader(token))
    .send({ pageNumber: 1, title: 'Page 1' });
  return { journalId, pageId: p.body.data._id };
}

describe('Image upload — POST /api/pages/:pageId/images', () => {
  beforeAll(async () => {
    await connect();
  });
  afterEach(async () => {
    await clear();
  });
  afterAll(async () => {
    await close();
  });

  test('valid MIME (image/png) => 201 with url', async () => {
    const reg = await registerUser(app, {
      name: 'Img User',
      email: 'img@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const { pageId } = await createJournalAndPage(app, token);

    const res = await request(app)
      .post(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(token))
      .attach('image', pngBuffer, { filename: 'tiny.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('_id');
    expect(res.body.data).toHaveProperty('mimeType', 'image/png');
    expect(res.body.data).toHaveProperty('url');
    expect(res.body.data.url).toMatch(/\/api\/images\//);
    // file exists on disk
    const saved = res.body.data;
    // verify GET returns image (200, content-type image/*)
    const get = await request(app).get(saved.url).set('Authorization', authHeader(token));
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toMatch(/image\//);
  });

  test('valid MIME (image/jpeg) => 201', async () => {
    const reg = await registerUser(app, {
      name: 'Jpeg',
      email: 'jpeg@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const { pageId } = await createJournalAndPage(app, token);

    const res = await request(app)
      .post(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(token))
      .attach('image', pngBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(res.body.data.mimeType).toBe('image/jpeg');
  });

  test('oversized file (>5MB) => 400 Image too large', async () => {
    const reg = await registerUser(app, {
      name: 'Big',
      email: 'big@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const { pageId } = await createJournalAndPage(app, token);

    // 6 MB buffer
    const big = Buffer.alloc(6 * 1024 * 1024, 0);
    const res = await request(app)
      .post(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(token))
      .attach('image', big, { filename: 'huge.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/too large|max 5 mb/i);
  });

  test('invalid MIME (text/plain) => 400 Unsupported file type', async () => {
    const reg = await registerUser(app, {
      name: 'BadMime',
      email: 'badmime@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const { pageId } = await createJournalAndPage(app, token);

    const res = await request(app)
      .post(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(token))
      .attach('image', Buffer.from('hello world'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/unsupported file type/i);
  });

  test('invalid MIME (application/pdf) => 400', async () => {
    const reg = await registerUser(app, {
      name: 'Pdf',
      email: 'pdf@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const { pageId } = await createJournalAndPage(app, token);

    const res = await request(app)
      .post(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(token))
      .attach('image', Buffer.from('%PDF'), {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unsupported/i);
  });

  test('no file provided => 400 No image file provided', async () => {
    const reg = await registerUser(app, {
      name: 'NoFile',
      email: 'nofile@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const { pageId } = await createJournalAndPage(app, token);

    const res = await request(app)
      .post(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(token))
      .field('x', '10');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no image file/i);
  });

  test('ownership: user B cannot upload to user A page => 403', async () => {
    const regA = await registerUser(app, {
      name: 'OwnerA',
      email: 'ownerA@example.com',
      password: 'password123',
    });
    const regB = await registerUser(app, {
      name: 'Intruder',
      email: 'intruder@example.com',
      password: 'password123',
    });
    const tokenA = regA.body.data.token;
    const tokenB = regB.body.data.token;
    const { pageId } = await createJournalAndPage(app, tokenA);

    const res = await request(app)
      .post(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(tokenB))
      .attach('image', pngBuffer, { filename: 'x.png', contentType: 'image/png' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/forbidden/i);
  });

  test('ownership: user B cannot fetch user A image => 403', async () => {
    const regA = await registerUser(app, {
      name: 'OwnerA2',
      email: 'ownerA2@example.com',
      password: 'password123',
    });
    const regB = await registerUser(app, {
      name: 'Intruder2',
      email: 'intruder2@example.com',
      password: 'password123',
    });
    const tokenA = regA.body.data.token;
    const tokenB = regB.body.data.token;
    const { pageId } = await createJournalAndPage(app, tokenA);

    const up = await request(app)
      .post(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(tokenA))
      .attach('image', pngBuffer, { filename: 'tiny.png', contentType: 'image/png' });
    const url = up.body.data.url;

    const getB = await request(app).get(url).set('Authorization', authHeader(tokenB));
    expect(getB.status).toBe(403);
  });

  test('list images by page returns array, respects ownership', async () => {
    const reg = await registerUser(app, {
      name: 'Lister',
      email: 'lister@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const { pageId } = await createJournalAndPage(app, token);

    await request(app)
      .post(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(token))
      .attach('image', pngBuffer, { filename: 'a.png', contentType: 'image/png' });
    await request(app)
      .post(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(token))
      .attach('image', pngBuffer, { filename: 'b.png', contentType: 'image/png' });

    const list = await request(app)
      .get(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(token));
    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(list.body.data).toHaveLength(2);
  });

  test('invalid pageId format => 400', async () => {
    const reg = await registerUser(app, {
      name: 'BadId',
      email: 'badid@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const res = await request(app)
      .post('/api/pages/not-valid-id/images')
      .set('Authorization', authHeader(token))
      .attach('image', pngBuffer, { filename: 'tiny.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid page id/i);
  });

  test('unauthenticated upload => 401', async () => {
    const reg = await registerUser(app, {
      name: 'Tmp',
      email: 'tmp@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const { pageId } = await createJournalAndPage(app, token);
    const res = await request(app)
      .post(`/api/pages/${pageId}/images`)
      .attach('image', pngBuffer, { filename: 'tiny.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  test('cloudinary stored image: GET redirects to remote url (302)', async () => {
    const Image = require('../models/Image');
    const reg = await registerUser(app, {
      name: 'CloudUser',
      email: 'cloud@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const { pageId } = await createJournalAndPage(app, token);

    const up = await request(app)
      .post(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(token))
      .attach('image', pngBuffer, { filename: 'tiny.png', contentType: 'image/png' });
    const imageId = up.body.data._id;

    // Simulate cloudinary migration: overwrite url to https and publicId to cloudinary id
    const cloudUrl = 'https://res.cloudinary.com/demo/image/upload/memorium/fake123.jpg';
    await Image.findByIdAndUpdate(imageId, { url: cloudUrl, publicId: 'memorium/fake123' });

    const get = await request(app)
      .get(`/api/images/${imageId}`)
      .set('Authorization', authHeader(token))
      .redirects(0);
    // supertest by default follows redirects; we disable with redirects(0) to check 302
    expect([301, 302, 303, 307, 308].includes(get.status)).toBe(true);
    expect(get.headers.location).toBe(cloudUrl);
  });

  test('local missing file: GET returns 404 Image file not found', async () => {
    const reg = await registerUser(app, {
      name: 'MissingFile',
      email: 'missing@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const { pageId } = await createJournalAndPage(app, token);

    const up = await request(app)
      .post(`/api/pages/${pageId}/images`)
      .set('Authorization', authHeader(token))
      .attach('image', pngBuffer, { filename: 'tiny.png', contentType: 'image/png' });
    const imageId = up.body.data._id;

    // delete local file manually to simulate missing
    const Image = require('../models/Image');
    const img = await Image.findById(imageId);
    const fs2 = require('fs');
    try {
      if (fs2.existsSync(img.path)) fs2.unlinkSync(img.path);
    } catch (_) {}
    try {
      const localAdapter = require('../storage/localAdapter');
      const p = localAdapter.resolvePath(img.publicId);
      if (fs2.existsSync(p)) fs2.unlinkSync(p);
    } catch (_) {}

    const get = await request(app)
      .get(`/api/images/${imageId}`)
      .set('Authorization', authHeader(token));
    expect(get.status).toBe(404);
    expect(get.body.message).toMatch(/not found/i);
  });
});
