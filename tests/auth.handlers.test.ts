import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hash } from 'bcryptjs';
import loginHandler from '../api/auth/login';
import signupHandler from '../api/auth/signup';

// Mock the datastore so the handlers run without a live database.
vi.mock('../api/_lib/db', () => {
  const json = (res: unknown, status: number, body: unknown) => {
    const r = res as any;
    r.setHeader('Cache-Control', 'no-store');
    r.status(status).json(body);
  };
  return { sql: vi.fn(), json };
});

// Imported after the mock is registered so it is the mocked version.
import { sql } from '../api/_lib/db';

type TestRes = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
  _code?: number;
  _body?: unknown;
};

function makeRes(): TestRes {
  const res: TestRes = { setHeader: () => {}, status: () => ({ json: () => {} }) } as TestRes;
  res.status = (code: number) => ({
    json: (body: unknown) => {
      res._code = code;
      res._body = body;
    },
  });
  return res;
}
function makeReq(method: string, body: unknown) {
  return { method, body } as { method: string; body: unknown };
}

const mockedSql = () => vi.mocked(sql);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/auth/login', () => {
  it('rejects non-POST methods with 405', async () => {
    const res = makeRes();
    await loginHandler(makeReq('GET', undefined), res);
    expect(res._code).toBe(405);
  });

  it('returns 400 when email or password is missing', async () => {
    const res = makeRes();
    await loginHandler(makeReq('POST', { email: 'ada@example.com' }), res);
    expect(res._code).toBe(400);
  });

  it('returns 401 when the account does not exist', async () => {
    mockedSql().mockResolvedValue([]);
    const res = makeRes();
    await loginHandler(
      makeReq('POST', { email: 'ghost@example.com', password: 'password123' }),
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
    await loginHandler(
      makeReq('POST', { email: 'ada@example.com', password: 'wrong' }),
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
    await loginHandler(
      makeReq('POST', { email: 'ADA@example.com', password: 'correct-horse' }),
      res,
    );
    expect(res._code).toBe(200);
    expect(res._body).toEqual({ user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' } });
    // The password hash is never sent to the client.
    expect(JSON.stringify(res._body)).not.toContain(passwordHash);
  });

  it('returns 500 on a datastore failure', async () => {
    mockedSql().mockRejectedValue(new Error('connection lost'));
    const res = makeRes();
    await loginHandler(
      makeReq('POST', { email: 'ada@example.com', password: 'correct-horse' }),
      res,
    );
    expect(res._code).toBe(500);
  });
});

describe('POST /api/auth/signup', () => {
  it('rejects non-POST methods with 405', async () => {
    const res = makeRes();
    await signupHandler(makeReq('GET', undefined), res);
    expect(res._code).toBe(405);
  });

  it('returns 400 for invalid input', async () => {
    const res = makeRes();
    await signupHandler(makeReq('POST', { name: 'Bo', email: 'bo@example.com', password: '12345' }), res);
    expect(res._code).toBe(400);
  });

  it('hashes the password and creates the account (201)', async () => {
    mockedSql().mockResolvedValue([
      { id: 'new-1', name: 'Ada Lovelace', email: 'ada@example.com' },
    ]);
    const res = makeRes();
    await signupHandler(
      makeReq('POST', { name: ' Ada Lovelace ', email: 'ADA@example.com', password: 'secret123' }),
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
    await signupHandler(
      makeReq('POST', { name: 'Ada Lovelace', email: 'ada@example.com', password: 'secret123' }),
      res,
    );
    expect(res._code).toBe(400);
  });
});
