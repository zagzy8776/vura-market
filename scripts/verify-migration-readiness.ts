#!/usr/bin/env npx tsx

import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

type AppliedMigration = { version: string; filename: string; checksum: string };
type FilesMigration = { version: string; filename: string; checksum: string };

const pool = new Pool({ connectionString: databaseUrl });
const migrationsDir = join(process.cwd(), 'db', 'migrations');

function migrationVersion(filename: string) {
  return filename.split('_', 1)[0];
}

const client = await pool.connect();

try {
  console.log('🔍 MIGRATION READINESS VERIFICATION\n');
  console.log('=' .repeat(60));

  // 1. Get local migration files
  console.log('\n1️⃣  LOCAL MIGRATION FILES');
  console.log('-' .repeat(60));

  const files = (await readdir(migrationsDir))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (files.length === 0) {
    console.error('❌ ERROR: No migration files found in db/migrations/');
    process.exit(1);
  }

  const localMigrations: Map<string, FilesMigration> = new Map();
  for (const filename of files) {
    const version = migrationVersion(filename);
    const contents = await readFile(join(migrationsDir, filename), 'utf8');
    const checksum = createHash('sha256').update(contents).digest('hex');
    localMigrations.set(version, { version, filename, checksum });
  }

  console.log(`✓ Found ${files.length} migration files`);
  files.forEach((f) => console.log(`  • ${f}`));

  // 2. Get applied migrations from database
  console.log('\n2️⃣  DATABASE APPLIED MIGRATIONS');
  console.log('-' .repeat(60));

  const dbResult = await client.query<AppliedMigration>(
    'SELECT version, filename, checksum FROM schema_migrations ORDER BY version::int'
  );
  const appliedMigrations = new Map(dbResult.rows.map((r) => [r.version, r]));

  console.log(`✓ ${dbResult.rows.length} migrations applied to database`);

  // 3. Check for conflicts
  console.log('\n3️⃣  CONFLICT CHECK');
  console.log('-' .repeat(60));

  const conflictVersions = ['6', '12', '13'];
  const foundConflicts = dbResult.rows.filter((r) => conflictVersions.includes(r.version));

  if (foundConflicts.length === 0) {
    console.log('✓ No conflicting versions found (6, 12, 13)');
  } else {
    console.log(`❌ CONFLICT DETECTED: Found ${foundConflicts.length} conflicting version(s)`);
    foundConflicts.forEach((row) => {
      console.log(`   Version ${row.version}: ${row.filename}`);
    });
    console.log('\n⚠️  ACTION REQUIRED: Delete these records before proceeding');
    process.exit(1);
  }

  // 4. Check for missing migrations
  console.log('\n4️⃣  PENDING MIGRATIONS');
  console.log('-' .repeat(60));

  const pendingMigrations: FilesMigration[] = [];
  localMigrations.forEach((localMig, version) => {
    const dbMig = appliedMigrations.get(version);
    if (!dbMig) {
      pendingMigrations.push(localMig);
    } else if (dbMig.filename !== localMig.filename || dbMig.checksum !== localMig.checksum) {
      console.error(`❌ ERROR: Migration ${version} has changed after application`);
      console.error(`   Previous: ${dbMig.filename} (${dbMig.checksum})`);
      console.error(`   Current:  ${localMig.filename} (${localMig.checksum})`);
      process.exit(1);
    }
  });

  if (pendingMigrations.length === 0) {
    console.log('✓ All migrations already applied');
  } else {
    console.log(`✓ ${pendingMigrations.length} migration(s) ready to apply:`);
    pendingMigrations.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true })).forEach((mig) => {
      console.log(`  • [${mig.version}] ${mig.filename}`);
    });
  }

  // 5. Check specifically for renamed migrations
  console.log('\n5️⃣  RENAMED MIGRATIONS STATUS');
  console.log('-' .repeat(60));

  const renamedVersions = ['21', '22', '23'];
  const renamedStatus = renamedVersions.map((v) => ({
    version: v,
    inLocal: localMigrations.has(v),
    inDatabase: appliedMigrations.has(v),
  }));

  renamedStatus.forEach((status) => {
    const symbol = status.inLocal && !status.inDatabase ? '✓' : status.inDatabase ? '⚠️ ' : '❌';
    const state = status.inLocal ? 'local file exists' : 'NOT FOUND';
    const dbState = status.inDatabase ? ' | already applied' : ' | ready to apply';
    console.log(`${symbol} Version ${status.version}: ${state}${dbState}`);
  });

  // 6. Final status
  console.log('\n' + '=' .repeat(60));
  console.log('✅ VERIFICATION COMPLETE\n');

  if (foundConflicts.length === 0 && pendingMigrations.length > 0) {
    console.log('STATUS: Ready to apply migrations');
    console.log('\nNext command:');
    console.log('  npm run db:migrate\n');
  } else if (foundConflicts.length === 0 && pendingMigrations.length === 0) {
    console.log('STATUS: All migrations already applied');
    console.log('No action needed.\n');
  } else {
    console.log('STATUS: Conflicts detected - cannot proceed');
    console.log('Please resolve conflicts before proceeding.\n');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
