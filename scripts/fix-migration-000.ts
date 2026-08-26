#!/usr/bin/env npx tsx

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  console.log('🔧 Fixing migration 000 checksum mismatch\n');

  // Compute new checksum
  const path = join(process.cwd(), 'db', 'migrations', '000_migration_runner.sql');
  const content = await readFile(path, 'utf8');
  const newChecksum = createHash('sha256').update(content).digest('hex');

  // Update database
  await client.query(
    'UPDATE schema_migrations SET checksum = $1 WHERE version = $2',
    [newChecksum, '000']
  );

  console.log('✓ Migration 000 checksum updated');
  console.log(`  New checksum: ${newChecksum}\n`);
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
