import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { hash } from 'bcryptjs';
import authHandler from '../api/auth/[action].ts';
import ordersHandler from '../api/orders/index.ts';
import paymentSubmissionHandler from '../api/orders/payment-submission.ts';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log('TEST_DATABASE_URL is not configured; skipping destructive integration suite.');
  process.exit(0);
}
if (/ep-polished-shape-b3j4v0kf|neondb_owner/i.test(url)) {
  throw new Error('Refusing to run integration tests against the Vura production database. Use a dedicated Neon test branch/database.');
}

const sql = neon(url);
await sql`DROP SCHEMA public CASCADE`;
await sql`CREATE SCHEMA public`;
const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf-8');
for (const statement of schema.split(';').map((s) => s.trim()).filter(Boolean)) await sql.query(statement);

// The production migration is not part of schema.sql yet; mirror its test-only shape here.
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz`;
await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number text`;
await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS transfer_reference text`;
await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_submitted_at timestamptz`;
await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz`;
await sql`CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, order_id uuid REFERENCES orders(id) ON DELETE CASCADE, type text NOT NULL, title text NOT NULL, body text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`;
await sql`CREATE TABLE email_deliveries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) ON DELETE SET NULL, order_id uuid REFERENCES orders(id) ON DELETE SET NULL, event_type text NOT NULL, recipient text NOT NULL, provider_id text, status text NOT NULL DEFAULT 'queued', error_message text, created_at timestamptz NOT NULL DEFAULT now())`;
await sql`UPDATE orders SET order_number = 'VURA-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 10)) WHERE order_number IS NULL`;
await sql`CREATE UNIQUE INDEX orders_order_number_uidx ON orders(order_number)`;
await sql`CREATE UNIQUE INDEX orders_transfer_reference_uidx ON orders(transfer_reference) WHERE transfer_reference IS NOT NULL`;


type TestRes = {
  headers: Record<string, string>;
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
  _code?: number;
  _body?: unknown;
};
function makeRes(): TestRes {
  const res: TestRes = { headers: {}, setHeader: () => {}, status: () => ({ json: () => {} }) } as TestRes;
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.status = (code) => ({ json: (body) => { res._code = code; res._body = body; } });
  return res;
}
function makeReq(method: string, action: string, body: unknown, cookie = '') {
  return { method, query: action ? { action } : {}, body, headers: cookie ? { cookie } : {}, socket: {} } as any;
}
function cookieFrom(res: TestRes) { return res.headers['Set-Cookie']?.split(';')[0] || ''; }
function check(name: string, cond: boolean, extra = '') {
  if (cond) { console.log('  ✓ ' + name); return true; }
  console.log('  ✗ ' + name + (extra ? ' -> ' + extra : '')); return false;
}

let pass = 0;
let fail = 0;
const run = (name: string, cond: boolean, extra = '') => cond ? (pass++, check(name, true, extra)) : (fail++, check(name, false, extra));
console.log('Running Vura integration tests against dedicated test database');

const signupRes = makeRes();
await authHandler(makeReq('POST', 'signup', { name: 'Ada Lovelace', email: 'ada@example.com', password: 'secret123' }), signupRes);
run('signup creates account (201)', signupRes._code === 201, `${signupRes._code}`);
run('signup returns public user', (signupRes._body as any)?.user?.email === 'ada@example.com');
const customerCookie = cookieFrom(signupRes);
run('signup establishes HttpOnly session cookie', /vura_session=.*HttpOnly/i.test(signupRes.headers['Set-Cookie'] || ''));

const notificationCount = await sql`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = ${(signupRes._body as any).user.id}`;
run('signup creates in-app welcome notification', notificationCount[0].count === 1);
const welcomeEmail = await sql`SELECT status FROM email_deliveries WHERE user_id = ${(signupRes._body as any).user.id} AND event_type = 'account.created' LIMIT 1`;
run('signup records transactional email attempt', welcomeEmail.length === 1);

const shortRes = makeRes();
await authHandler(makeReq('POST', 'signup', { name: 'Bo', email: 'bo@example.com', password: '123' }), shortRes);
run('signup rejects short password (400)', shortRes._code === 400);

const duplicateRes = makeRes();
await authHandler(makeReq('POST', 'signup', { name: 'Ada Again', email: 'ada@example.com', password: 'secret123' }), duplicateRes);
run('signup rejects duplicate email (400)', duplicateRes._code === 400);

const loginRes = makeRes();
await authHandler(makeReq('POST', 'login', { email: 'ada@example.com', password: 'secret123' }), loginRes);
run('signin succeeds (200)', loginRes._code === 200);
run('signin never exposes password hash', !JSON.stringify(loginRes._body).includes('password_hash'));

const userId = (signupRes._body as any).user.id;
const productRows = await sql`INSERT INTO products (seller_id, name, brand, description, price_kobo) VALUES (${userId}, 'Test Phone', 'Test', 'Integration product', 12500000) RETURNING id`;
const orderRes = makeRes();
await ordersHandler(makeReq('POST', '', { productId: productRows[0].id, quantity: 1, name: 'Ada Lovelace', phone: '08000000000', address: '1 Test Street', city: 'Lagos' }, customerCookie), orderRes);
run('order creation succeeds (201)', orderRes._code === 201, `${orderRes._code}: ${JSON.stringify(orderRes._body)}`);
run('order returns Vura bank transfer details', (orderRes._body as any)?.payment?.accountNumber === '4600544947');
const orderId = (orderRes._body as any)?.order?.id;
run('order has a public order number', /^VURA-/i.test((orderRes._body as any)?.order?.order_number || ''));

const orderNotification = await sql`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = ${userId} AND order_id = ${orderId}`;
run('order creates customer notification', orderNotification[0].count >= 1);

const paymentRes = makeRes();
await paymentSubmissionHandler(makeReq('POST', '', { orderId, transferReference: 'TRX-TEST-001' }, customerCookie), paymentRes);
run('payment confirmation submission succeeds (200)', paymentRes._code === 200, `${paymentRes._code}: ${JSON.stringify(paymentRes._body)}`);
const paymentRow = await sql`SELECT payment_status, status, transfer_reference FROM orders WHERE id = ${orderId}`;
run('payment moves to pending verification', paymentRow[0].payment_status === 'pending_verification' && paymentRow[0].status === 'payment_verification');
run('transfer reference is stored', paymentRow[0].transfer_reference === 'TRX-TEST-001');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
