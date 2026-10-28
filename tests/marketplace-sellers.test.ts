import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../api/_lib/db.js', () => ({
  sql: vi.fn().mockResolvedValue([]),
  json: (res: { status: (n: number) => { json: (b: unknown) => void } }, status: number, body: unknown) => res.status(status).json(body),
}));
vi.mock('../api/_lib/auth.js', () => ({ requireUser: vi.fn(), requireAdminPermission: vi.fn() }));
vi.mock('../api/_lib/audit.js', () => ({ recordAudit: vi.fn() }));

import { validateListing, handleSeller, handleMarketplaceModeration } from '../api/_lib/marketplace.js';
import { requireUser, requireAdminPermission } from '../api/_lib/auth.js';
import { sql } from '../api/_lib/db.js';

const data = {
  title: 'Quality used phone', description: 'Good condition with accessories',
  priceKobo: 5000000, condition: 'Used - good', quantity: 1,
  categoryId: 'f5c2b283-cdb7-4186-a812-6550e9f4ba19',
  images: ['https://res.cloudinary.com/vura/image/upload/v1/phone.jpg'],
  shopName: 'Campus Gadgets', whatsapp: '2348012345678', stateCode: 'LA', city: 'Yaba', campus: 'UNILAG',
};
const makeRes = () => {
  const state = { code: 0, body: {} as unknown };
  return { state, res: { status(code: number) { state.code = code; return { json(body: unknown) { state.body = body; } }; } } };
};
const makeReq = (method: string, body: unknown = {}, query: Record<string,string> = {}) => ({ method, body, query });

beforeEach(() => { vi.clearAllMocks(); });

describe('marketplace listing boundaries', () => {
  it('accepts valid listing metadata', () => expect(validateListing(data)).toBeNull());
  it('rejects missing photos, invalid price, and invalid category', () => {
    expect(validateListing({ ...data, images: [] })).toMatch(/photos/i);
    expect(validateListing({ ...data, priceKobo: -100 })).toMatch(/price/i);
    expect(validateListing({ ...data, categoryId: 'admin' })).toMatch(/category/i);
  });
  it('rejects untrusted image URLs', () => {
    expect(validateListing({ ...data, images: ['https://evil.example/file.jpg'] })).toMatch(/photo/i);
  });
  it('requires authentication before listing queries', async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(null);
    const { res } = makeRes();
    await handleSeller(makeReq('GET') as never, res as never);
    expect(sql).not.toHaveBeenCalled();
  });
  it('prevents edits when a listing is not owned by the signed-in seller', async () => {
    vi.mocked(requireUser).mockResolvedValueOnce({ id: 'seller-1', role: 'customer', name: 'S', email: 's@x.com' });
    vi.mocked(sql).mockResolvedValueOnce([]);
    const { res, state } = makeRes();
    await handleSeller(makeReq('PATCH', { id: 'f5c2b283-cdb7-4186-a812-6550e9f4ba19', action: 'pause' }) as never, res as never, { id: 'f5c2b283-cdb7-4186-a812-6550e9f4ba19', action: 'pause' });
    expect(state.code).toBe(404);
    expect(vi.mocked(sql).mock.calls).toHaveLength(1);
    expect(vi.mocked(sql).mock.calls[0]).toContain('seller-1');
  });
  it('does not expose moderation to ordinary customers', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValueOnce(null);
    const { res } = makeRes();
    await handleMarketplaceModeration(makeReq('GET') as never, res as never);
    expect(sql).not.toHaveBeenCalled();
  });
});
