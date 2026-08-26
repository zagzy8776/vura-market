#!/usr/bin/env npx tsx

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  console.log('🔧 FULL DATABASE REBUILD\n');
  console.log('=' .repeat(70));

  // Step 1: Apply base schema
  console.log('\n1️⃣  Applying base schema from db/schema.sql...');
  const schemaPath = join(process.cwd(), 'db', 'schema.sql');
  const schemaSql = await readFile(schemaPath, 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(schemaSql);
    await client.query('COMMIT');
    console.log('✓ Base schema applied');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  // Step 2: Clear schema migrations table
  console.log('\n2️⃣  Clearing schema_migrations table...');
  await client.query('DELETE FROM schema_migrations');
  console.log('✓ Table cleared');

  // Step 3: Verify tables exist
  console.log('\n3️⃣  Verifying base tables exist...');
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log(`✓ Found ${tables.rows.length} tables:`);
  tables.rows.slice(0, 10).forEach((row) => {
    console.log(`  - ${row.table_name}`);
  });
  if (tables.rows.length > 10) {
    console.log(`  ... and ${tables.rows.length - 10} more`);
  }

  console.log('\n' + '=' .repeat(70));
  console.log('\n✅ BASE SCHEMA READY\n');
  console.log('Next: Run `npm run db:migrate` to apply all migrations (001-026)\n');
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
