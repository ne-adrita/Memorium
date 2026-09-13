const request = require('supertest');
const { connect, clear, close } = require('./setup');
const { registerUser, authHeader, createJournal } = require('./helpers');

const app = require('../server');

describe('Journals CRUD + ownership', () => {
  beforeAll(async () => {
    await connect();
  });
  afterEach(async () => {
    await clear();
  });
  afterAll(async () => {
    await close();
  });

  async function twoUsers() {
    const a = await registerUser(app, {
      name: 'User A',
      email: 'a@example.com',
      password: 'password123',
    });
    const b = await registerUser(app, {
      name: 'User B',
      email: 'b@example.com',
      password: 'password123',
    });
    return {
      tokenA: a.body.data.token,
      userA: a.body.data.user,
      tokenB: b.body.data.token,
      userB: b.body.data.user,
    };
  }

  test('create + list + get + update + delete flow (owner)', async () => {
    const { tokenA } = await twoUsers();

    // create
    const created = await createJournal(app, tokenA, {
      title: 'My First Journal',
      description: 'desc',
    });
    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);
    expect(created.body.data).toHaveProperty('title', 'My First Journal');
    const journalId = created.body.data._id;

    // list — should contain 1 for A
    const listed = await request(app).get('/api/journals').set('Authorization', authHeader(tokenA));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0]._id).toBe(journalId);

    // get
    const got = await request(app)
      .get(`/api/journals/${journalId}`)
      .set('Authorization', authHeader(tokenA));
    expect(got.status).toBe(200);
    expect(got.body.data._id).toBe(journalId);

    // update
    const updated = await request(app)
      .put(`/api/journals/${journalId}`)
      .set('Authorization', authHeader(tokenA))
      .send({ title: 'Updated Title' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe('Updated Title');

    // delete
    const del = await request(app)
      .delete(`/api/journals/${journalId}`)
      .set('Authorization', authHeader(tokenA));
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);

    // get after delete => 404
    const after = await request(app)
      .get(`/api/journals/${journalId}`)
      .set('Authorization', authHeader(tokenA));
    expect(after.status).toBe(404);
  });

  test('list isolates by owner: user A cannot see user B journals', async () => {
    const { tokenA, tokenB } = await twoUsers();
    await createJournal(app, tokenA, { title: 'A journal' });
    await createJournal(app, tokenB, { title: 'B journal' });

    const listA = await request(app).get('/api/journals').set('Authorization', authHeader(tokenA));
    const listB = await request(app).get('/api/journals').set('Authorization', authHeader(tokenB));
    expect(listA.body.data).toHaveLength(1);
    expect(listB.body.data).toHaveLength(1);
    expect(listA.body.data[0].title).toBe('A journal');
    expect(listB.body.data[0].title).toBe('B journal');
  });

  test('ownership: user B cannot get / update / delete user A journal => 403', async () => {
    const { tokenA, tokenB } = await twoUsers();
    const created = await createJournal(app, tokenA, { title: 'Private' });
    const journalId = created.body.data._id;

    const get = await request(app)
      .get(`/api/journals/${journalId}`)
      .set('Authorization', authHeader(tokenB));
    expect(get.status).toBe(403);
    expect(get.body.message).toMatch(/forbidden/i);

    const put = await request(app)
      .put(`/api/journals/${journalId}`)
      .set('Authorization', authHeader(tokenB))
      .send({ title: 'Hacked' });
    expect(put.status).toBe(403);

    const del = await request(app)
      .delete(`/api/journals/${journalId}`)
      .set('Authorization', authHeader(tokenB));
    expect(del.status).toBe(403);

    // ensure A can still access
    const still = await request(app)
      .get(`/api/journals/${journalId}`)
      .set('Authorization', authHeader(tokenA));
    expect(still.status).toBe(200);
  });

  test('create without title => 400', async () => {
    const reg = await registerUser(app, {
      name: 'Owner',
      email: 'owner@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const res = await request(app)
      .post('/api/journals')
      .set('Authorization', authHeader(token))
      .send({ description: 'no title' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title.*required/i);
  });

  test('get with invalid ObjectId => 400', async () => {
    const reg = await registerUser(app, {
      name: 'Owner',
      email: 'o2@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const res = await request(app)
      .get('/api/journals/not-a-valid-id')
      .set('Authorization', authHeader(token));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid journal id/i);
  });

  test('unauthenticated access => 401', async () => {
    const res = await request(app).get('/api/journals');
    expect(res.status).toBe(401);
    const res2 = await request(app).post('/api/journals').send({ title: 'No Auth' });
    expect(res2.status).toBe(401);
  });

  test('get nonexistent valid ObjectId => 404', async () => {
    const reg = await registerUser(app, {
      name: 'Owner',
      email: 'o3@example.com',
      password: 'password123',
    });
    const token = reg.body.data.token;
    const fakeId = '000000000000000000000000';
    const res = await request(app)
      .get(`/api/journals/${fakeId}`)
      .set('Authorization', authHeader(token));
    expect(res.status).toBe(404);
  });
});
