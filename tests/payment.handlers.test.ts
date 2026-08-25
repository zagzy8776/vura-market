import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/_lib/notifications', () => ({
  notifyUser: vi.fn().mockResolvedValue({ sent: false, configured: false }),
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
  requireUser: vi.fn(),
}));

import { requireUser } from '../api/_lib/auth';
import handler from '../api/orders/payment-submission';

type TestRes = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
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
  });
  return res;
}

function makeReq(body: unknown, session: { id: string } | null = { id: 'u-self' }) {
  vi.mocked(requireUser).mockResolvedValue(session as never);
  return { method: 'POST', body, headers: {}, socket: { remoteAddress: '127.0.0.1' } } as never;
}

const mockedSql = () => vi.mocked(sql);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/orders/payment-submission (IDOR fix)', () => {
  it('bails out (and writes nothing) when there is no session', async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(null);
    const res = makeRes();
    await handler(makeReq({ orderId: 'o-1', transferReference: 'REF123' }, null), res);
    // requireUser is responsible for the 401 in production; here we just assert the handler
    // did not proceed to touch the database.
    expect(mockedSql()).not.toHaveBeenCalled();
    expect(res._code).toBeUndefined();
  });

  it('returns 400 when the body is missing fields', async () => {
    const res = makeRes();
    await handler(makeReq({ orderId: 'o-1' }, { id: 'u-self' }), res);
    expect(res._code).toBe(400);
  });

  it('returns 404 when the order is not owned by the authenticated user', async () => {
    mockedSql().mockResolvedValueOnce([]);
    const res = makeRes();
    await handler(makeReq({ orderId: 'o-foreign', transferReference: 'ABC123' }, { id: 'u-self' }), res);
    expect(res._code).toBe(404);
    // body must not reveal whether the order exists for another user
    expect(JSON.stringify(res._body)).not.toMatch(/foreign/);
  });

  it('scopes the UPDATE to the authenticated user and writes an order_event', async () => {
    mockedSql()
      .mockResolvedValueOnce([{ id: 'o-self', order_number: 'VURA-ABCDEF', total_kobo: 100000, buyer_id: 'u-self' }])
      .mockResolvedValueOnce([{ name: 'Ada', email: 'ada@example.com' }]);
    const res = makeRes();
    await handler(makeReq({ orderId: 'o-self', transferReference: 'TRF-9001' }, { id: 'u-self' }), res);
    expect(res._code).toBe(200);

    const updateCall = mockedSql().mock.calls[0];
    const strings = updateCall[0] as readonly string[];
    const sqlText = strings.join(' ');
    expect(sqlText).toMatch(/buyer_id\s*=/);
    expect(sqlText).toMatch(/payment_status\s*=\s*'unpaid'/);
    const params = updateCall.slice(1) as unknown[];
    expect(params).toContain('o-self');
    expect(params).toContain('u-self');
    expect(params).toContain('TRF-9001');

    expect(mockedSql().mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not return the transfer_reference in the response', async () => {
    mockedSql()
      .mockResolvedValueOnce([{ id: 'o-self', order_number: 'VURA-ABCDEF', total_kobo: 100000, buyer_id: 'u-self' }])
      .mockResolvedValueOnce([{ name: 'Ada', email: 'ada@example.com' }]);
    const res = makeRes();
    await handler(makeReq({ orderId: 'o-self', transferReference: 'SECRET-REF' }, { id: 'u-self' }), res);
    expect(JSON.stringify(res._body)).not.toContain('SECRET-REF');
  });
});
