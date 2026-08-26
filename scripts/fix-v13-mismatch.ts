#!/usr/bin/env npx tsx

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const migrationsDir = join(process.cwd(), 'db', 'migrations');
const expectedFilename = '013_nigeria_states_seed.sql';
const expectedPath = join(migrationsDir, expectedFilename);

const pool = new Pool({ connectionString: databaseUrl });

type AppliedMigration = { version: string; filename: string; checksum: string };

const client = await pool.connect();
try {
  console.log('🔧 FIXING VERSION 13 MIGRATION MISMATCH\n');
  console.log('=' .repeat(70));

  // 1. Get the expected checksum
  console.log('\n1️⃣  Computing checksum for new version 13 file...');
  const fileContents = await readFile(expectedPath, 'utf8');
  const newChecksum = createHash('sha256').update(fileContents).digest('hex');
  console.log(`✓ Checksum: ${newChecksum}`);

  // 2. Check current state in database
  console.log('\n2️⃣  Checking current state in database...');
  const result = await client.query<AppliedMigration>(
    `SELECT version, filename, checksum FROM schema_migrations WHERE version = '013'`
  );

  if (result.rows.length === 0) {
    console.error('❌ ERROR: Version 13 not found in schema_migrations table');
    process.exit(1);
  }

  const current = result.rows[0];
  console.log(`Current filename: ${current.filename}`);
  console.log(`Current checksum: ${current.checksum}`);
  console.log(`Expected filename: ${expectedFilename}`);
  console.log(`Expected checksum: ${newChecksum}`);

  if (current.filename === expectedFilename && current.checksum === newChecksum) {
    console.log('\n✅ No action needed - version 13 is already correct!');
    process.exit(0);
  }

  // 3. Show what will change
  console.log('\n3️⃣  Proposed changes:');
  if (current.filename !== expectedFilename) {
    console.log(`   • Filename: "${current.filename}" → "${expectedFilename}"`);
  }
  if (current.checksum !== newChecksum) {
    console.log(`   • Checksum: will be updated`);
  }

  // 4. Check for confirmation
  const shouldConfirm = process.env.CONFIRM_FIX_V13 !== 'true';
  if (shouldConfirm) {
    console.log('\n⚠️  This will update the schema_migrations table for version 13.');
    console.log('The database schema itself is NOT affected.');
    console.log('\nTo confirm and apply this fix, run:');
    console.log('   CONFIRM_FIX_V13=true npm run fix-v13-mismatch');
    console.log('\nOr execute the fix script with confirmation.');
    process.exit(0);
  }

  // 5. Execute the fix
  console.log('\n4️⃣  Applying fix...');
  await client.query('BEGIN');
  try {
    const updateResult = await client.query(
      `UPDATE schema_migrations 
       SET filename = $1, checksum = $2 
       WHERE version = '013'`,
      [expectedFilename, newChecksum]
    );

    console.log(`✓ Updated ${updateResult.rowCount} record(s)`);

    // 6. Verify the fix
    console.log('\n5️⃣  Verifying fix...');
    const verifyResult = await client.query<AppliedMigration>(
      `SELECT version, filename, checksum FROM schema_migrations WHERE version = '013'`
    );

    const updated = verifyResult.rows[0];
    const filenameMatch = updated.filename === expectedFilename;
    const checksumMatch = updated.checksum === newChecksum;

    if (filenameMatch && checksumMatch) {
      console.log(`✓ Filename: ${updated.filename}`);
      console.log(`✓ Checksum: ${updated.checksum}`);
      await client.query('COMMIT');
      console.log('\n' + '=' .repeat(70));
      console.log('✅ VERSION 13 FIX COMPLETE\n');
      console.log('Next steps:');
      console.log('  1. Run: npm run db:migrate');
      console.log('  2. This will apply versions 019-023');
      console.log('  3. Verify with: npm run db:verify\n');
    } else {
      console.error('❌ Verification failed after update');
      await client.query('ROLLBACK');
      process.exit(1);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
