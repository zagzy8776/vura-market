#!/usr/bin/env npx tsx

import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  console.log('🔧 Resetting migration 000 to re-apply with base schema\n');

  await client.query('DELETE FROM schema_migrations WHERE version = $1', ['000']);
  console.log('✓ Migration 000 removed from history');
  console.log('\nNext: Run `npm run db:migrate` to re-apply 000 with full base schema\n');
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
