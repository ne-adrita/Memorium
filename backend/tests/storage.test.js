const fs = require('fs');
const path = require('path');

// Ensure STORAGE_DRIVER is isolated per test
const storageIndexPath = require.resolve('../storage');
const localAdapterPath = require.resolve('../storage/localAdapter');
const cloudinaryAdapterPath = require.resolve('../storage/cloudinaryAdapter');

describe('Storage — localAdapter', () => {
  let localAdapter;

  beforeAll(() => {
    process.env.STORAGE_DRIVER = 'local';
    // clear require cache to re-init adapters with correct env
    jest.resetModules();
    localAdapter = require('../storage/localAdapter');
  });

  afterEach(() => {
    // clean created files
    const dir = localAdapter.UPLOAD_DIR;
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f === '.gitkeep') continue;
        try {
          fs.unlinkSync(path.join(dir, f));
        } catch (_) {}
      }
    }
  });

  test('upload(buffer, meta) -> { publicId, url } and writes file', async () => {
    const buf = Buffer.from('fake-image-content');
    const result = await localAdapter.upload(buf, {
      originalName: 'photo.png',
      mimeType: 'image/png',
    });

    expect(result).toHaveProperty('publicId');
    expect(result).toHaveProperty('url');
    expect(typeof result.publicId).toBe('string');
    expect(result.publicId).toMatch(/\.png$/);
    // file exists
    expect(fs.existsSync(result.url)).toBe(true);
    expect(fs.existsSync(localAdapter.resolvePath(result.publicId))).toBe(true);
    expect(localAdapter.exists(result.publicId)).toBe(true);
    const stored = fs.readFileSync(result.url);
    expect(stored.equals(buf)).toBe(true);
  });

  test('upload sanitizes extension fallback to .jpg for unknown ext', async () => {
    const buf = Buffer.from('data');
    const result = await localAdapter.upload(buf, {
      originalName: 'weird.xyz',
      mimeType: 'image/jpeg',
    });
    expect(result.publicId).toMatch(/\.jpg$/);
    expect(fs.existsSync(result.url)).toBe(true);
  });

  test('delete(publicId) removes file (idempotent)', async () => {
    const buf = Buffer.from('to-delete');
    const { publicId, url } = await localAdapter.upload(buf, {
      originalName: 'todelete.jpg',
      mimeType: 'image/jpeg',
    });
    expect(fs.existsSync(url)).toBe(true);
    await localAdapter.delete(publicId);
    expect(fs.existsSync(url)).toBe(false);
    // second delete should not throw
    await expect(localAdapter.delete(publicId)).resolves.toBeUndefined();
    expect(localAdapter.exists(publicId)).toBe(false);
  });

  test('delete handles directory traversal safely (basename)', async () => {
    const buf = Buffer.from('traverse');
    const { publicId } = await localAdapter.upload(buf, {
      originalName: 'safe.png',
      mimeType: 'image/png',
    });
    // try with path traversal string — should still delete correct file or no-op
    const traversal = `../../${path.basename(publicId)}`;
    // our adapter uses basename, so it will resolve inside UPLOAD_DIR
    await localAdapter.delete(traversal);
    // file should be gone if traversal was treated as basename
    expect(localAdapter.exists(publicId)).toBe(false);
  });

  test('interface: upload and delete are functions', () => {
    expect(typeof localAdapter.upload).toBe('function');
    expect(typeof localAdapter.delete).toBe('function');
  });
});

describe('Storage — cloudinaryAdapter (mocked)', () => {
  const originalEnv = { ...process.env };
  let cloudinaryMock;
  let cloudinaryAdapter;

  beforeAll(() => {
    jest.resetModules();
  });

  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';

    // Mock cloudinary module before requiring adapter
    jest.resetModules();
    cloudinaryMock = {
      config: jest.fn(),
      uploader: {
        upload_stream: jest.fn((opts, cb) => {
          // simulate cloudinary response
          const fakeResult = {
            public_id: opts.public_id || 'memorium/fake123',
            secure_url: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/memorium/fake123.jpg`,
            format: 'jpg',
          };
          // return a mock stream with .end()
          return {
            end: buffer => {
              // ensure buffer received
              expect(Buffer.isBuffer(buffer)).toBe(true);
              process.nextTick(() => cb(null, fakeResult));
            },
          };
        }),
        destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
      },
    };

    jest.doMock('cloudinary', () => ({ v2: cloudinaryMock }));
    cloudinaryAdapter = require('../storage/cloudinaryAdapter');
  });

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('cloudinary');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('upload(buffer, meta) -> { publicId, url } via cloudinary', async () => {
    const buf = Buffer.from('cloudinary-image');
    const result = await cloudinaryAdapter.upload(buf, {
      originalName: 'pic.jpg',
      mimeType: 'image/jpeg',
    });

    expect(cloudinaryMock.config).toHaveBeenCalled();
    expect(cloudinaryMock.uploader.upload_stream).toHaveBeenCalledWith(
      expect.objectContaining({
        resource_type: 'image',
        public_id: expect.stringContaining('memorium/'),
      }),
      expect.any(Function)
    );
    expect(result).toHaveProperty('publicId');
    expect(result).toHaveProperty('url');
    expect(result.url).toMatch(/^https:\/\/res\.cloudinary\.com/);
    expect(result.publicId).toMatch(/^memorium\//);
  });

  test('delete(publicId) calls cloudinary destroy', async () => {
    await cloudinaryAdapter.delete('memorium/abc123');
    expect(cloudinaryMock.uploader.destroy).toHaveBeenCalledWith('memorium/abc123', {
      resource_type: 'image',
    });
  });

  test('delete no-op if no publicId', async () => {
    await expect(cloudinaryAdapter.delete(null)).resolves.toBeUndefined();
    await expect(cloudinaryAdapter.delete('')).resolves.toBeUndefined();
    expect(cloudinaryMock.uploader.destroy).not.toHaveBeenCalled();
  });

  test('throws if Cloudinary env missing', async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    jest.resetModules();
    jest.doMock('cloudinary', () => ({ v2: cloudinaryMock }));
    const fresh = require('../storage/cloudinaryAdapter');
    await expect(fresh.upload(Buffer.from('x'), { originalName: 'a.jpg' })).rejects.toThrow(
      /Cloudinary not configured/
    );
    await expect(fresh.delete('some/id')).rejects.toThrow(/Cloudinary not configured/);
  });

  test('interface: upload and delete are functions', async () => {
    expect(typeof cloudinaryAdapter.upload).toBe('function');
    expect(typeof cloudinaryAdapter.delete).toBe('function');
  });

  test('upload_stream error propagates', async () => {
    cloudinaryMock.uploader.upload_stream.mockImplementation((opts, cb) => ({
      end: () => process.nextTick(() => cb(new Error('upload failed'), null)),
    }));
    // re-require to pick up mock? already mocked, just call
    await expect(
      cloudinaryAdapter.upload(Buffer.from('fail'), { originalName: 'fail.jpg' })
    ).rejects.toThrow(/upload failed/);
  });
});

describe('Storage — index (driver selection)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('getDriver defaults to local when STORAGE_DRIVER not set', () => {
    delete process.env.STORAGE_DRIVER;
    jest.resetModules();
    const storage = require('../storage');
    expect(storage.getDriver()).toBe('local');
    expect(storage.getAdapter()).toBe(storage.localAdapter);
  });

  test('getDriver returns local for unknown value', () => {
    process.env.STORAGE_DRIVER = 'unknown';
    jest.resetModules();
    const storage = require('../storage');
    expect(storage.getDriver()).toBe('local');
  });

  test('getDriver returns cloudinary when set', () => {
    process.env.STORAGE_DRIVER = 'cloudinary';
    jest.resetModules();
    const storage = require('../storage');
    expect(storage.getDriver()).toBe('cloudinary');
    expect(storage.getAdapter()).toBe(storage.cloudinaryAdapter);
  });

  test('case-insensitive and trimmed', () => {
    process.env.STORAGE_DRIVER = '  CLOUDINARY  ';
    jest.resetModules();
    const storage = require('../storage');
    expect(storage.getDriver()).toBe('cloudinary');
  });

  test('storage.upload delegates to localAdapter when driver=local', async () => {
    process.env.STORAGE_DRIVER = 'local';
    jest.resetModules();
    const storage = require('../storage');
    const spy = jest
      .spyOn(storage.localAdapter, 'upload')
      .mockResolvedValue({ publicId: 'x', url: '/tmp/x' });
    const res = await storage.upload(Buffer.from('hi'), { originalName: 'hi.png' });
    expect(spy).toHaveBeenCalled();
    expect(res.publicId).toBe('x');
    spy.mockRestore();
    // cleanup file if created? none
  });

  test('storage.upload delegates to cloudinaryAdapter when driver=cloudinary (mocked)', async () => {
    process.env.STORAGE_DRIVER = 'cloudinary';
    process.env.CLOUDINARY_CLOUD_NAME = 'c';
    process.env.CLOUDINARY_API_KEY = 'k';
    process.env.CLOUDINARY_API_SECRET = 's';
    jest.resetModules();
    const mockCloudinary = {
      config: jest.fn(),
      uploader: {
        upload_stream: jest.fn((opts, cb) => ({
          end: buf =>
            process.nextTick(() =>
              cb(null, {
                public_id: 'memorium/mock',
                secure_url: 'https://cloudinary.com/mock.jpg',
                format: 'jpg',
              })
            ),
        })),
        destroy: jest.fn().mockResolvedValue({}),
      },
    };
    jest.doMock('cloudinary', () => ({ v2: mockCloudinary }));
    const storage = require('../storage');
    const res = await storage.upload(Buffer.from('hi'), { originalName: 'hi.jpg' });
    expect(res.publicId).toBe('memorium/mock');
    expect(res.url).toMatch(/cloudinary/);
    jest.dontMock('cloudinary');
  });

  test('storage.delete delegates correctly', async () => {
    process.env.STORAGE_DRIVER = 'local';
    jest.resetModules();
    const storage = require('../storage');
    const spy = jest.spyOn(storage.localAdapter, 'delete').mockResolvedValue();
    await storage.delete('some-file.jpg');
    expect(spy).toHaveBeenCalledWith('some-file.jpg');
    spy.mockRestore();
  });
});

describe('Storage adapter interface contract', () => {
  test('both adapters implement upload(buffer, meta) -> {url, publicId} and delete(publicId)', () => {
    const storage = require('../storage');
    for (const adapter of [storage.localAdapter, storage.cloudinaryAdapter]) {
      expect(typeof adapter.upload).toBe('function');
      expect(typeof adapter.delete).toBe('function');
      // arity check
      expect(adapter.upload.length).toBeGreaterThanOrEqual(1);
      expect(adapter.delete.length).toBeGreaterThanOrEqual(1);
    }
  });
});
