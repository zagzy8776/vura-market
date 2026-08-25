import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const requiredRelations = [
  'schema_migrations',
  'product_variants',
  'inventory_movements',
  'inventory_reservations',
  'order_fulfillments',
  'shipment_tracking_events',
  'payment_transactions',
  'ledger_accounts',
  'ledger_entries',
  'refunds',
  'return_requests',
  'supplier_payables',
  'supplier_payouts',
  'payout_attempts',
  'courier_providers',
  'courier_webhook_events',
  'sla_violations',
  'nigeria_states',
  'nigeria_lgas',
  'delivery_zones',
  'wishlists',
  'analytics_events',
];

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();
try {
  const result = await client.query<{ relname: string | null }>(
    `SELECT relname FROM pg_class WHERE relkind IN ('r', 'v', 'm') AND relname = ANY($1::text[])`,
    [requiredRelations],
  );

  const actual = new Set(result.rows.map((row) => row.relname).filter(Boolean));
  const missing = requiredRelations.filter((name) => !actual.has(name));
  if (missing.length) {
    throw new Error(`Schema verification failed. Missing relations: ${missing.join(', ')}`);
  }

  const migrationCount = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM schema_migrations');
  console.log(`Schema verification passed: ${actual.size}/${requiredRelations.length} required relations present; ${migrationCount.rows[0]?.count ?? '0'} migrations recorded.`);
} finally {
  client.release();
  await pool.end();
}
