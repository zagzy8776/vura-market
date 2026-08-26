#!/usr/bin/env npx tsx

import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  console.log('🔧 CLEAN REBUILD - Dropping all schema\n');
  console.log('=' .repeat(70));

  console.log('\n1️⃣  Dropping all tables (except schema_migrations)...');
  
  // Get all table names except schema_migrations
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name != 'schema_migrations'
    ORDER BY table_name DESC
  `);

  for (const row of tables.rows) {
    try {
      await client.query(`DROP TABLE IF EXISTS "${row.table_name}" CASCADE`);
      console.log(`  ✓ Dropped ${row.table_name}`);
    } catch (e) {
      console.log(`  ⚠️  Failed to drop ${row.table_name}: ${(e as any).message?.split('\n')[0]}`);
    }
  }

  console.log('\n2️⃣  Dropping all functions...');
  const functions = await client.query(`
    SELECT p.proname, n.nspname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY p.proname
  `);

  for (const func of functions.rows) {
    try {
      await client.query(`DROP FUNCTION IF EXISTS "${func.nspname}"."${func.proname}" CASCADE`);
      console.log(`  ✓ Dropped ${func.proname}`);
    } catch (e) {
      // Function may be recreated or not exist, ignore
    }
  }

  console.log('\n3️⃣  Clearing schema_migrations...');
  await client.query('DELETE FROM schema_migrations');
  console.log('✓ Cleared');

  console.log('\n' + '=' .repeat(70));
  console.log('\n✅ DATABASE CLEANED\n');
  console.log('Next: Run `npm run db:migrate` to rebuild from migrations only\n');
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
