import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import loginHandler from '../api/auth/login.ts';
import signupHandler from '../api/auth/signup.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = neon(url);

// Reset and rebuild the schema from the canonical db/schema.sql so the test
// always runs against a clean, known state.
await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`;
await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto;`;
const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf-8');
for (const statement of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
  await sql.query(statement);
}

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

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log('  \u2713 ' + name);
  } else {
    fail++;
    console.log('  \u2717 ' + name + (extra ? ' -> ' + extra : ''));
  }
}

console.log('Running sign-in / sign-up integration tests against ' + url);

// --- Signup ---
{
  const res = makeRes();
  await signupHandler(
    makeReq('POST', { name: 'Ada Lovelace', email: 'ada@example.com', password: 'secret123' }),
    res,
  );
  check('signup creates account (201)', res._code === 201, `${res._code}: ${JSON.stringify(res._body)}`);
  check('signup returns the public user', (res._body as any)?.user?.email === 'ada@example.com');
}

{
  const res = makeRes();
  await signupHandler(
    makeReq('POST', { name: 'Bo', email: 'bo@example.com', password: '123' }),
    res,
  );
  check('signup rejects short password (400)', res._code === 400);
}

{
  const res = makeRes();
  await signupHandler(
    makeReq('POST', { name: 'Ada Again', email: 'ada@example.com', password: 'secret123' }),
    res,
  );
  check('signup rejects duplicate email (400)', res._code === 400);
}

// --- Sign in ---
{
  const res = makeRes();
  await loginHandler(
    makeReq('POST', { email: 'ada@example.com', password: 'secret123' }),
    res,
  );
  check('signin succeeds with correct password (200)', res._code === 200, `${res._code}`);
  check('signin returns the user', (res._body as any)?.user?.email === 'ada@example.com');
  check('signin never exposes the password hash', !JSON.stringify(res._body).includes('password_hash'));
}

{
  const res = makeRes();
  await loginHandler(
    makeReq('POST', { email: 'ada@example.com', password: 'wrong-password' }),
    res,
  );
  check('signin fails on wrong password (401)', res._code === 401);
}

{
  const res = makeRes();
  await loginHandler(
    makeReq('POST', { email: 'nobody@example.com', password: 'secret123' }),
    res,
  );
  check('signin fails for unknown user (401)', res._code === 401);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
