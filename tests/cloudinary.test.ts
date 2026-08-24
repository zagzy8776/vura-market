import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCloudinaryConfig,
  uploadToCloudinary,
  uploadFilesToCloudinary,
  CLOUDINARY_UPLOAD_URL,
} from '../src/lib/cloudinary';

beforeEach(() => {
  vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'demo');
  vi.stubEnv('VITE_CLOUDINARY_UPLOAD_PRESET', 'unsigned_preset');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('cloudinary config', () => {
  it('reads the cloud name and upload preset from env', () => {
    const cfg = getCloudinaryConfig();
    expect(cfg.cloudName).toBe('demo');
    expect(cfg.uploadPreset).toBe('unsigned_preset');
  });

  it('builds the unsigned upload endpoint URL', () => {
    expect(CLOUDINARY_UPLOAD_URL('demo')).toBe(
      'https://api.cloudinary.com/v1_1/demo/image/upload',
    );
  });
});

describe('uploadToCloudinary (unsigned)', () => {
  it('throws when Cloudinary is not configured', async () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', '');
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      uploadToCloudinary(new File(['x'], 'a.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow(/not configured/);
  });

  it('throws when no valid file is supplied', async () => {
    await expect(uploadToCloudinary(undefined as unknown as File)).rejects.toThrow(
      'A valid file is required',
    );
  });

  it('uploads a file and resolves to the secure url', async () => {
    const json = {
      secure_url: 'https://res.cloudinary.com/demo/image/upload/v123/abc.jpg',
      public_id: 'abc',
      url: 'http://res.cloudinary.com/demo/image/upload/v123/abc.jpg',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => json }));

    const url = await uploadToCloudinary(
      new File(['hello'], 'photo.jpg', { type: 'image/jpeg' }),
    );
    expect(url).toBe(json.secure_url);
    expect(fetch).toHaveBeenCalledWith('https://api.cloudinary.com/v1_1/demo/image/upload', {
      method: 'POST',
      body: expect.any(FormData),
    });
  });

  it('throws the Cloudinary error message on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Invalid upload preset' } }),
    }));
    await expect(
      uploadToCloudinary(new File(['hello'], 'photo.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow('Invalid upload preset');
  });

  it('falls back to a generic message when no details are returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    await expect(
      uploadToCloudinary(new File(['hello'], 'photo.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow('Could not upload image to Cloudinary');
  });
});

describe('uploadFilesToCloudinary', () => {
  it('uploads every file and returns all secure urls', async () => {
    const json = {
      secure_url: 'https://res.cloudinary.com/demo/image/upload/v123/x.jpg',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => json }));
    const files = [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ];
    const urls = await uploadFilesToCloudinary(files);
    expect(urls).toHaveLength(2);
    expect(urls.every((u) => u === json.secure_url)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
