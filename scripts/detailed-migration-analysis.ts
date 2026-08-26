#!/usr/bin/env npx tsx

import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

type AppliedMigration = { version: string; filename: string; checksum: string };

const pool = new Pool({ connectionString: databaseUrl });
const migrationsDir = join(process.cwd(), 'db', 'migrations');

function migrationVersion(filename: string) {
  return filename.split('_', 1)[0];
}

const client = await pool.connect();

try {
  console.log('📋 DETAILED MIGRATION ANALYSIS\n');

  // Get database state
  const dbResult = await client.query<AppliedMigration>(
    'SELECT version, filename, checksum FROM schema_migrations ORDER BY version::int'
  );

  // Get local files
  const files = (await readdir(migrationsDir))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  console.log('Analyzing all versions:\n');
  console.log('Version | Status      | Database Filename                      | Local Filename                         | Match');
  console.log('-'.repeat(120));

  const allVersions = new Set<string>();
  files.forEach((f) => allVersions.add(migrationVersion(f)));
  dbResult.rows.forEach((r) => allVersions.add(r.version));

  const sortedVersions = Array.from(allVersions).sort((a, b) => Number(a) - Number(b));

  for (const version of sortedVersions) {
    const dbRow = dbResult.rows.find((r) => r.version === version);
    const localFile = files.find((f) => migrationVersion(f) === version);

    let status = '?';
    let match = '';

    if (dbRow && localFile) {
      const contents = await readFile(join(migrationsDir, localFile), 'utf8');
      const checksum = createHash('sha256').update(contents).digest('hex');
      status = 'BOTH';
      match = dbRow.checksum === checksum ? '✓' : '❌ MISMATCH';
    } else if (dbRow) {
      status = 'DB ONLY';
    } else if (localFile) {
      status = 'LOCAL ONLY';
    }

    const dbName = dbRow?.filename || '(not applied)';
    const localName = localFile || '(not in repo)';

    console.log(
      `${version.padStart(7)} | ${status.padEnd(11)} | ${dbName.padEnd(38)} | ${localName.padEnd(38)} | ${match}`
    );
  }

  console.log('\n' + '-'.repeat(120));
  console.log('\nKEY FINDINGS:\n');

  // Specific analysis for problematic versions
  const version13Local = files.find((f) => migrationVersion(f) === '13');
  const version13Db = dbResult.rows.find((r) => r.version === '13');

  if (version13Local && version13Db && version13Db.filename !== version13Local) {
    console.log(`⚠️  MISMATCH DETECTED at Version 13:`);
    console.log(`    Applied in DB: ${version13Db.filename}`);
    console.log(`    Local file:    ${version13Local}`);
    console.log(`    The database applied a different migration to version 13`);
    console.log(`    than what's currently in the repository.\n`);
  }

  // Check for renamed versions
  console.log('✓ RENAMED MIGRATIONS STATUS:');
  console.log('  Version 21 (013 → 021 rename): ' + (files.some((f) => migrationVersion(f) === '21') ? '✓ exists locally' : '❌ missing'));
  console.log('  Version 22 (012 → 022 rename): ' + (files.some((f) => migrationVersion(f) === '22') ? '✓ exists locally' : '❌ missing'));
  console.log('  Version 23 (013 → 023 rename): ' + (files.some((f) => migrationVersion(f) === '23') ? '✓ exists locally' : '❌ missing'));
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
