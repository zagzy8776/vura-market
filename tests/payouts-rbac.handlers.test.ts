import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/_lib/notifications', () => ({
  notifyUser: vi.fn().mockResolvedValue({ sent: false }),
  notifyAdmins: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/_lib/db', () => {
  const json = (res: unknown, status: number, body: unknown) => {
    const r = res as { _code: number; _body: unknown; setHeader: () => void; status: (code: number) => { json: (b: unknown) => void } };
    r._code = status;
    r._body = body;
  };
  return { sql: vi.fn(), json };
});

import { sql } from '../api/_lib/db';

vi.mock('../api/_lib/auth', () => ({
  requireAdmin: vi.fn(),
  requireAdminPermission: vi.fn(),
}));

import { requireAdminPermission, requireAdmin } from '../api/_lib/auth';
import handler from '../api/admin';

type TestRes = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void; send?: (b: unknown) => void };
  _code?: number;
  _body?: unknown;
};

function makeRes(): TestRes {
  const res: TestRes = { setHeader: () => undefined, status: () => ({ json: () => undefined }) } as TestRes;
  res.status = (code: number) => ({
    json: (body: unknown) => {
      res._code = code;
      res._body = body;
    },
    send: () => undefined,
  });
  return res;
}

const mockedSql = () => vi.mocked(sql);
const mockedPerm = () => vi.mocked(requireAdminPermission);

function grant(permission: string | null) {
  vi.mocked(requireAdmin).mockResolvedValue({ id: 'admin-1', name: 'Owner', email: 'owner@vura.test', role: 'admin' } as never);
  mockedPerm().mockImplementation(async (_req, _res, needed) => {
    if (permission !== needed) return null;
    return { id: 'admin-1', name: 'Owner', email: 'owner@vura.test' } as never;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RBAC enforcement on /api/admin', () => {
  it.each([
    ['finance', 'GET', 'finance.read'],
    ['payouts', 'GET', 'payouts.read'],
    ['payouts', 'POST', 'payouts.manage'],
    ['privacy', 'POST', 'customers.privacy'],
    ['sla', 'GET', 'sla.read'],
    ['courier', 'POST', 'courier.manage'],
    ['export', 'GET', null],
  ])('requires permission for %s %s', async (resource, method, expected) => {
    if (!expected) return; // export permission depends on type param
    grant(expected);
    const req = { method, query: { resource }, body: {}, headers: {} } as never;
    await handler(req, makeRes() as never);
    expect(mockedPerm()).toHaveBeenCalled();
  });

  it('denies payouts.manage when only payouts.read is granted', async () => {
    grant('payouts.read');
    const req = { method: 'POST', query: { resource: 'payouts' }, body: { action: 'create', supplierId: 's1' }, headers: {} } as never;
    await handler(req, makeRes() as never);
    // Permission denied short-circuits before any SQL runs.
    expect(mockedSql()).not.toHaveBeenCalled();
  });

  it('delivery mutations use deliveries.manage (regression: orders.write never existed)', async () => {
    grant('deliveries.manage');
    const req = { method: 'PATCH', query: { resource: 'delivery' }, body: { fulfillmentId: 'f1', status: 'dispatched' }, headers: {} } as never;
    await handler(req, makeRes() as never);
    expect(mockedPerm()).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'deliveries.manage');
  });

  it('overview exposes financial data only with finance.read', async () => {
    grant('orders.update');
    const req = { method: 'GET', query: { resource: 'overview' }, body: {}, headers: {} } as never;
    await handler(req, makeRes() as never);
    expect(mockedSql()).not.toHaveBeenCalled();
  });
});

describe('supplier payout lifecycle', () => {
  it('creates a payout from eligible payables and audits it', async () => {
    grant('payouts.manage');
    mockedSql()
      .mockResolvedValueOnce([{ id: 'p-1', payout_reference: 'PO-AB-1', amount_kobo: 5000, status: 'pending' }])
      .mockResolvedValueOnce([]);
    const req = { method: 'POST', query: { resource: 'payouts' }, body: { action: 'create', supplierId: 'sup-1' }, headers: {} } as never;
    const res = makeRes();
    await handler(req, res as never);
    expect(res._code).toBe(201);
    expect((res._body as { payout: { payout_reference: string } }).payout.payout_reference).toBe('PO-AB-1');
  });

  it('settle success returns outcome paid', async () => {
    grant('payouts.manage');
    mockedSql().mockResolvedValueOnce([{ outcome: 'paid' }]).mockResolvedValueOnce([]);
    const req = { method: 'POST', query: { resource: 'payouts' }, body: { action: 'settle', reference: 'PO-AB-1', success: true }, headers: {} } as never;
    const res = makeRes();
    await handler(req, res as never);
    expect(res._code).toBe(200);
    expect((res._body as { outcome: string }).outcome).toBe('paid');
  });

  it('rejects settle without an explicit success boolean', async () => {
    grant('payouts.manage');
    const req = { method: 'POST', query: { resource: 'payouts' }, body: { action: 'settle', reference: 'PO-AB-1' }, headers: {} } as never;
    const res = makeRes();
    await handler(req, res as never);
    expect(res._code).toBe(400);
    expect(mockedSql()).not.toHaveBeenCalled();
  });

  it('maps NO_ELIGIBLE_PAYABLES to 409 without leaking internals', async () => {
    grant('payouts.manage');
    mockedSql().mockRejectedValueOnce(new Error('NO_ELIGIBLE_PAYABLES'));
    const req = { method: 'POST', query: { resource: 'payouts' }, body: { action: 'create', supplierId: 'sup-1' }, headers: {} } as never;
    const res = makeRes();
    await handler(req, res as never);
    expect(res._code).toBe(409);
    expect(JSON.stringify(res._body)).not.toContain('NO_ELIGIBLE');
  });
});
