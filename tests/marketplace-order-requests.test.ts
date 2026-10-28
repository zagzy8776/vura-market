import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/_lib/db.js', () => ({
 sql: vi.fn(),
 json: (res: { status: (n: number) => { json: (b: unknown) => void } }, code: number, value: unknown) => res.status(code).json(value),
}));
vi.mock('../api/_lib/auth.js', () => ({ requireUser: vi.fn() }));
vi.mock('../api/_lib/onesignal.js', () => ({ sendOneSignalPush: vi.fn().mockResolvedValue({ ok: true }), appBaseUrl: vi.fn().mockReturnValue('') }));
vi.mock('../api/_lib/email.js', () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({ ok: true }) }));

import { sql } from '../api/_lib/db.js';
import { requireUser } from '../api/_lib/auth.js';
import { marketplaceOrders } from '../api/_lib/marketplace-orders.js';
import { normalizeNigeriaPhone } from '../api/_lib/nigeria-phone.js';

const makeRes = () => {
 const result = { status: 0, data: {} as unknown };
 return { result, res: { status(code: number) { result.status = code; return { json(value: unknown) { result.data = value; } }; } } };
};
const buyer = { id: '6a6e9cde-9c22-4aca-a243-802e566965d3', role: 'customer' as const, email: 'buyer@demo.test', name: 'Buyer' };
const sample = {
 listingId: '37b2398a-f874-4f97-ade5-0fd066b57dc4', requestId: 'a7284c36-4cc3-44e8-ad2d-0184d5236629',
 phone: '+2348012345678', quantity: 1, stateCode: 'LA', city: 'Yaba'
};
beforeEach(() => { vi.clearAllMocks(); });

describe('purchase request security', () => {
 it('does not process unauthenticated requests', async () => {
   vi.mocked(requireUser).mockResolvedValueOnce(null);
   const { res } = makeRes();
   await marketplaceOrders({method:'POST'} as never,res as never,sample);
   expect(sql).not.toHaveBeenCalled();
 });
 it('rejects malformed order requests before database access', async () => {
   vi.mocked(requireUser).mockResolvedValueOnce(buyer);
   const { res,result } = makeRes();
   await marketplaceOrders({method:'POST'} as never,res as never,{...sample,quantity:-5});
   expect(result.status).toBe(400);
   expect(sql).not.toHaveBeenCalled();
 });
 it('rejects requests for your own listing', async () => {
   vi.mocked(requireUser).mockResolvedValueOnce(buyer);
   vi.mocked(sql).mockRejectedValueOnce(new Error('CANNOT_BUY_OWN_LISTING'));
   const { res,result } = makeRes();
   await marketplaceOrders({method:'POST'} as never,res as never,sample);
   expect(result.status).toBe(400);
   expect(String((result.data as {error:string}).error)).toMatch(/own listing/);
 });
 it('does not allow unauthorized seller to approve another seller order', async () => {
   vi.mocked(requireUser).mockResolvedValueOnce(buyer);
   vi.mocked(sql).mockRejectedValueOnce(new Error('ORDER_NOT_FOUND'));
   const { res,result } = makeRes();
   await marketplaceOrders({method:'PATCH'} as never,res as never,{id:sample.listingId,action:'accept'});
   expect(result.status).toBe(404);
 });
 it('accepts Nigerian telephone syntax but does not claim verification', () => {
   expect(normalizeNigeriaPhone('0803 123 4567')).toBe('+2348031234567');
   expect(normalizeNigeriaPhone('+2348031234567')).toBe('+2348031234567');
   expect(normalizeNigeriaPhone('123')).toBeNull();
 });
});
