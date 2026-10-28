import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSql = vi.hoisted(() => vi.fn());
const mockJson = vi.hoisted(() => vi.fn());
const mockUser = vi.hoisted(() => vi.fn());
const mockAdmin = vi.hoisted(() => vi.fn());
vi.mock('../api/_lib/db.js', () => ({ sql: mockSql, json: mockJson }));
vi.mock('../api/_lib/auth.js', () => ({ requireUser: mockUser, requireAdminPermission: mockAdmin }));
vi.mock('../api/_lib/audit.js', () => ({ recordAudit: vi.fn() }));

import { handleSeller, handleMarketplaceModeration, validateListing } from '../api/_lib/marketplace.js';

const valid = {
  title: 'iPhone 12 128GB', description: 'Neatly used phone',
  priceKobo: 18000000, quantity: 1, condition: 'Used - good',
  categoryId: '3f74fd84-91e4-4c6b-8a3b-4db32bce4585',
  shopName: 'Student gadgets', whatsapp: '2348012345678',
  stateCode: 'IM', city: 'Owerri', campus: 'FUTO',
  images: ['https://res.cloudinary.com/vura/image/upload/v1/phone.jpg'],
};
const req = (method: string, body: object = {}) =>
  ({ method, body, query: {}, headers: {} }) as Parameters<typeof handleSeller>[0];
const res = () => ({}) as Parameters<typeof handleSeller>[1];

describe('seller marketplace permissions and validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
    mockUser.mockResolvedValue({ id: 'seller-A', role: 'customer' });
    mockAdmin.mockResolvedValue(null);
  });

  it('accepts valid product details without requiring Studio permissions', () => {
    expect(validateListing(valid)).toBeNull();
    expect(validateListing({ ...valid, quantity: 100 })).toBeNull();
  });

  it('rejects invalid prices and unsafe images', () => {
    expect(validateListing({ ...valid, priceKobo: -1 })).toMatch(/price/);
    expect(validateListing({ ...valid, images: ['javascript:alert(1)'] })).toMatch(/photos/);
    expect(validateListing({ ...valid, images: [] })).toMatch(/photos/);
    expect(validateListing({ ...valid, images: Array(9).fill(valid.images[0]) })).toMatch(/photos/);
  });

  it('requires a real shop contact and location', () => {
    expect(validateListing({ ...valid, whatsapp: '0' })).toMatch(/WhatsApp/);
    expect(validateListing({ ...valid, stateCode: 'Nigeria' })).toMatch(/state/);
    expect(validateListing({ ...valid, shopName: '' })).toMatch(/shop/);
  });

  it('does not query seller inventory without an authenticated user', async () => {
    mockUser.mockResolvedValueOnce(null);
    await handleSeller(req('GET'), res());
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('scopes the seller inventory query to the logged-in user', async () => {
    await handleSeller(req('GET'), res());
    expect(mockSql).toHaveBeenCalled();
    expect(mockSql.mock.calls.some(call => call.slice(1).includes('seller-A'))).toBe(true);
    expect(mockJson).toHaveBeenCalledWith(expect.anything(), 200, expect.objectContaining({ listings: [] }));
  });

  it('keeps the moderation endpoint admin-only even when a user is signed in', async () => {
    await handleMarketplaceModeration(req('GET'), res());
    expect(mockAdmin).toHaveBeenCalled();
    expect(mockSql).not.toHaveBeenCalled();
  });
});
