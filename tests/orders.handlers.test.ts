import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/_lib/notifications', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  notifyAdmins: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/_lib/db', () => {
  const json = (res: unknown, status: number, body: unknown) => {
    const r = res as { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (b: unknown) => void }; _code?: number; _body?: unknown };
    r._code = status;
    r._body = body;
    r.setHeader('Cache-Control', 'no-store');
  };
  return { sql: vi.fn(), json };
});

import { sql } from '../api/_lib/db';

vi.mock('../api/_lib/auth', () => ({
  getSessionUser: vi.fn(),
  createSession: vi.fn(),
  issueClaimToken: vi.fn(),
}));

import { getSessionUser, createSession, issueClaimToken } from '../api/_lib/auth';
import handler from '../api/orders/index';

type TestRes = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
  _code?: number;
  _body?: unknown;
};

function makeRes(): TestRes {
  const res: TestRes = { setHeader: () => undefined, status: () => ({ json: () => undefined }) };
  res.status = (code: number) => ({ json: (body: unknown) => { res._code = code; res._body = body; } });
  return res;
}

function makeReq(body: unknown) {
  return {
    method: 'POST',
    body,
    headers: { 'x-forwarded-proto': 'https', host: 'vura.test' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Parameters<typeof handler>[0];
}

const mockedSql = () => vi.mocked(sql);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/orders (guest claim flow)', () => {
  it('creates a new guest user, issues a session, mints a claim token, and never returns it in JSON', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    vi.mocked(issueClaimToken).mockResolvedValueOnce({ rawToken: 'claim-raw-token-32-bytes-min-len', tokenHash: 'h', expiresAt: new Date() });

    // 1) lookup existing by email → no rows → new guest branch
    // 2) insert into users → new user row
    // 3) insert into orders → order row
    // 4) update orders.order_number → numbered order
    // 5) platform_settings → 3 rows
    // 6) product name lookup
    mockedSql()
      .mockResolvedValueOnce([]) // existing user lookup
      .mockResolvedValueOnce([{ id: 'u-new', name: 'Ada', email: 'ada@example.com' }]) // insert users
      .mockResolvedValueOnce([{ id: 'o-1', order_number: null, total_kobo: 250000, payment_method: 'bank_transfer', payment_status: 'unpaid' }]) // insert orders
      .mockResolvedValueOnce([{ order_number: 'VURA-ABCDEF' }]) // update order_number
      .mockResolvedValueOnce([{ key: 'payout_account_number', value: '4600544947' }, { key: 'payout_account_name', value: 'Vura Tech Hub' }, { key: 'payout_bank_name', value: 'VFD Microfinance Bank' }])
      .mockResolvedValueOnce([{ name: 'iPhone 15' }]); // product name

    const res = makeRes();
    await handler(makeReq({ productId: 'p-1', quantity: 1, name: 'Ada', email: 'ada@example.com', phone: '+234 800 0000', address: '1 Marina', city: 'Lagos' }), res);

    expect(res._code).toBe(201);
    expect(vi.mocked(createSession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(issueClaimToken)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(issueClaimToken).mock.calls[0][0]).toBe('u-new');

    // The raw token must NOT be returned in the JSON body
    expect(JSON.stringify(res._body)).not.toContain('claim-raw-token-32-bytes-min-len');
  });

  it('existing logged-in user does not get a claim token', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'u-existing', name: 'Ada', email: 'ada@example.com', role: 'customer' });

    mockedSql()
      .mockResolvedValueOnce([{ id: 'o-2', order_number: 'VURA-EXISTING', total_kobo: 200000, payment_method: 'bank_transfer', payment_status: 'unpaid' }]) // insert orders
      .mockResolvedValueOnce([{ key: 'payout_account_number', value: '4600544947' }, { key: 'payout_account_name', value: 'Vura Tech Hub' }, { key: 'payout_bank_name', value: 'VFD Microfinance Bank' }])
      .mockResolvedValueOnce([{ name: 'iPhone 15' }]);

    const res = makeRes();
    await handler(makeReq({ productId: 'p-1', quantity: 1, name: 'Ada', email: 'ada@example.com', phone: '+234 800 0000', address: '1 Marina', city: 'Lagos' }), res);

    expect(res._code).toBe(201);
    expect(vi.mocked(createSession)).not.toHaveBeenCalled();
    expect(vi.mocked(issueClaimToken)).not.toHaveBeenCalled();
  });

  it('guest with an existing account email does not get a new claim token (returning user)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    mockedSql()
      .mockResolvedValueOnce([{ id: 'u-existing', name: 'Ada', email: 'ada@example.com' }]) // existing user
      .mockResolvedValueOnce([{ id: 'o-3', order_number: 'VURA-EXISTING2', total_kobo: 150000, payment_method: 'bank_transfer', payment_status: 'unpaid' }])
      .mockResolvedValueOnce([{ key: 'payout_account_number', value: '4600544947' }, { key: 'payout_account_name', value: 'Vura Tech Hub' }, { key: 'payout_bank_name', value: 'VFD Microfinance Bank' }])
      .mockResolvedValueOnce([{ name: 'iPhone 15' }]);

    const res = makeRes();
    await handler(makeReq({ productId: 'p-1', quantity: 1, name: 'Ada', email: 'ada@example.com', phone: '+234 800 0000', address: '1 Marina', city: 'Lagos' }), res);

    expect(res._code).toBe(201);
    expect(vi.mocked(createSession)).not.toHaveBeenCalled();
    expect(vi.mocked(issueClaimToken)).not.toHaveBeenCalled();
  });
});
