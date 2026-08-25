import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hash } from 'bcryptjs';
import authHandler from '../api/auth/[action]';

// Mock the datastore so the handlers run without a live database.
vi.mock('../api/_lib/db', () => {
  const json = (res: unknown, status: number, body: unknown) => {
    const r = res as { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (b: unknown) => void } };
    r.setHeader('Cache-Control', 'no-store');
    r.status(status).json(body);
  };
  return { sql: vi.fn(), json };
});

// Mock auth helpers — we don't want claim tests to actually issue sessions or
// depend on session-cookie parsing here.
vi.mock('../api/_lib/auth', () => ({
  createSession: vi.fn(),
  destroySession: vi.fn(),
  getSessionUser: vi.fn(),
  issueClaimToken: vi.fn(),
  consumeClaimToken: vi.fn(),
}));

// Imported after the mock is registered so it is the mocked version.
import { sql } from '../api/_lib/db';

type TestRes = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
  _code?: number;
  _body?: unknown;
};

function makeRes(): TestRes {
  const res: TestRes = { setHeader: () => undefined, status: () => ({ json: () => undefined }) };
  res.status = (code: number) => ({
    json: (body: unknown) => {
      res._code = code;
      res._body = body;
    },
  });
  return res;
}
function makeReq(method: string, action: string, body: unknown) {
  return {
    method,
    query: { action },
    body,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Parameters<typeof authHandler>[0];
}

const mockedSql = () => vi.mocked(sql);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/auth/login', () => {
  it('rejects non-POST methods with 405', async () => {
    const res = makeRes();
    await authHandler(makeReq('GET', 'login', undefined), res);
    expect(res._code).toBe(405);
  });

  it('returns 400 when email or password is missing', async () => {
    const res = makeRes();
    await authHandler(makeReq('POST', 'login', { email: 'ada@example.com' }), res);
    expect(res._code).toBe(400);
  });

  it('returns 401 when the account does not exist', async () => {
    mockedSql().mockResolvedValue([]);
    const res = makeRes();
    await authHandler(
      makeReq('POST', 'login', { email: 'ghost@example.com', password: 'password123' }),
      res,
    );
    expect(res._code).toBe(401);
  });

  it('returns 401 when the password is wrong', async () => {
    const passwordHash = await hash('correct-horse', 12);
    mockedSql().mockResolvedValue([
      { id: 'u1', name: 'Ada', email: 'ada@example.com', password_hash: passwordHash },
    ]);
    const res = makeRes();
    await authHandler(
      makeReq('POST', 'login', { email: 'ada@example.com', password: 'wrong' }),
      res,
    );
    expect(res._code).toBe(401);
  });

  it('returns 200 and the public user on success', async () => {
    const passwordHash = await hash('correct-horse', 12);
    mockedSql().mockResolvedValue([
      { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', password_hash: passwordHash },
    ]);
    const res = makeRes();
    await authHandler(
      makeReq('POST', 'login', { email: 'ADA@example.com', password: 'correct-horse' }),
      res,
    );
    expect(res._code).toBe(200);
    expect(res._body).toEqual({ user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: undefined } });
    // The password hash is never sent to the client.
    expect(JSON.stringify(res._body)).not.toContain(passwordHash);
  });

  it('returns 500 on a datastore failure', async () => {
    mockedSql().mockRejectedValue(new Error('connection lost'));
    const res = makeRes();
    await authHandler(
      makeReq('POST', 'login', { email: 'ada@example.com', password: 'correct-horse' }),
      res,
    );
    expect(res._code).toBe(500);
  });
});

describe('POST /api/auth/signup', () => {
  it('rejects non-POST methods with 405', async () => {
    const res = makeRes();
    await authHandler(makeReq('GET', 'signup', undefined), res);
    expect(res._code).toBe(405);
  });

  it('returns 400 for invalid input', async () => {
    const res = makeRes();
    await authHandler(makeReq('POST', 'signup', { name: 'Bo', email: 'bo@example.com', password: '12345' }), res);
    expect(res._code).toBe(400);
  });

  it('hashes the password and creates the account (201)', async () => {
    mockedSql().mockResolvedValue([
      { id: 'new-1', name: 'Ada Lovelace', email: 'ada@example.com' },
    ]);
    const res = makeRes();
    await authHandler(
      makeReq('POST', 'signup', { name: ' Ada Lovelace ', email: 'ADA@example.com', password: 'secret123' }),
      res,
    );
    expect(res._code).toBe(201);
    expect(res._body).toEqual({ user: { id: 'new-1', name: 'Ada Lovelace', email: 'ada@example.com' } });

    const call = mockedSql().mock.calls[0];
    // tagged template: sql([...], name, email, passwordHash)
    const passwordHash = call[3] as string;
    expect(passwordHash).not.toBe('secret123');
    expect(passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt hash
  });

  it('returns 400 when the email is already taken', async () => {
    mockedSql().mockRejectedValue(new Error('duplicate key value'));
    const res = makeRes();
    await authHandler(
      makeReq('POST', 'signup', { name: 'Ada Lovelace', email: 'ada@example.com', password: 'secret123' }),
      res,
    );
    expect(res._code).toBe(400);
  });
});

describe('POST /api/auth/claim', () => {
  it('rejects non-POST methods with 405', async () => {
    const res = makeRes();
    await authHandler(makeReq('GET', 'claim', undefined), res);
    expect(res._code).toBe(405);
  });

  it('returns 400 when the token or password is missing/short', async () => {
    const res = makeRes();
    await authHandler(makeReq('POST', 'claim', { token: 'a'.repeat(24), password: '123' }), res);
    expect(res._code).toBe(400);
  });

  it('returns 400 when the token has been used or expired', async () => {
    const { consumeClaimToken } = await import('../api/_lib/auth');
    vi.mocked(consumeClaimToken).mockResolvedValueOnce(null);
    const res = makeRes();
    await authHandler(makeReq('POST', 'claim', { token: 'a'.repeat(24), password: 'newPassword123' }), res);
    expect(res._code).toBe(400);
    expect(JSON.stringify(res._body)).toMatch(/expired|used/i);
  });

  it('hashes the new password, issues a session, and returns the public user', async () => {
    const { consumeClaimToken, createSession } = await import('../api/_lib/auth');
    vi.mocked(consumeClaimToken).mockResolvedValueOnce('u-new');
    mockedSql().mockResolvedValueOnce([{ id: 'u-new', name: 'Ada', email: 'ada@example.com', role: 'customer' }]);
    const res = makeRes();
    await authHandler(makeReq('POST', 'claim', { token: 'a'.repeat(24), password: 'newPassword123' }), res);
    expect(res._code).toBe(200);
    expect(res._body).toEqual({ user: { id: 'u-new', name: 'Ada', email: 'ada@example.com', role: 'customer' } });
    expect(vi.mocked(createSession)).toHaveBeenCalled();
    // The UPDATE statement must include bcrypt-hashed password (not the raw value).
    const updateCall = mockedSql().mock.calls[0];
    const params = updateCall.slice(1) as unknown[];
    const passwordHash = params[0] as string;
    expect(passwordHash).not.toBe('newPassword123');
    expect(passwordHash).toMatch(/^\$2[aby]\$/);
    // The raw token must never appear in the response.
    expect(JSON.stringify(res._body)).not.toContain('a'.repeat(24));
  });

  it('returns 404 when the user row cannot be found after the token was consumed', async () => {
    const { consumeClaimToken } = await import('../api/_lib/auth');
    vi.mocked(consumeClaimToken).mockResolvedValueOnce('u-ghost');
    mockedSql().mockResolvedValueOnce([]);
    const res = makeRes();
    await authHandler(makeReq('POST', 'claim', { token: 'a'.repeat(24), password: 'newPassword123' }), res);
    expect(res._code).toBe(404);
  });
});
