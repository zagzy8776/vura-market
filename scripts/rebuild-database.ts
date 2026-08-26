#!/usr/bin/env npx tsx

import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  console.log('🔧 DATABASE REBUILD - Clearing migration history\n');
  console.log('=' .repeat(70));

  // Clear the schema_migrations table to allow re-running all migrations
  console.log('\n1️⃣  Clearing schema_migrations table...');
  const result = await client.query('DELETE FROM schema_migrations');
  console.log(`✓ Deleted ${result.rowCount} records`);

  console.log('\n2️⃣  Verifying table is empty...');
  const verify = await client.query('SELECT COUNT(*) as count FROM schema_migrations');
  console.log(`✓ Table now has ${verify.rows[0].count} records`);

  console.log('\n' + '=' .repeat(70));
  console.log('\n✅ READY FOR REBUILD\n');
  console.log('Next: Run `npm run db:migrate` to rebuild the schema\n');
  console.log('This will apply all 26 migrations in sequence:');
  console.log('  - Migrations 000-018: Original application schema');
  console.log('  - Migration 019: Fix missing RBAC tables');
  console.log('  - Migration 020: Admin permissions seed');
  console.log('  - Migration 021: Order version control');
  console.log('  - Migrations 024-026: Duplicate migration cleanup\n');
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
