import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

type AppliedMigration = { version: string; filename: string; applied_at: string };

const client = await pool.connect();
try {
  console.log('📊 Current schema_migrations table:\n');

  const result = await client.query<AppliedMigration>(
    `SELECT version, filename, applied_at FROM schema_migrations ORDER BY version::int ASC`
  );

  if (result.rows.length === 0) {
    console.log('⚠️  No migrations have been applied yet.');
  } else {
    console.log(`Total migrations applied: ${result.rows.length}\n`);
    result.rows.forEach((row) => {
      console.log(`  [${row.version}] ${row.filename}`);
      console.log(`       Applied: ${row.applied_at}`);
    });
  }

  // Check specifically for the renamed versions
  console.log('\n🔍 Checking for old version conflicts (6, 12, 13):');
  const conflictResult = await client.query<AppliedMigration>(
    `SELECT version, filename FROM schema_migrations WHERE version IN ('6', '12', '13') ORDER BY version`
  );

  if (conflictResult.rows.length === 0) {
    console.log('  ✓ None found - clean state');
  } else {
    console.log(`  ⚠️  Found ${conflictResult.rows.length} record(s):`);
    conflictResult.rows.forEach((row) => {
      console.log(`     Version ${row.version}: ${row.filename}`);
    });
  }

  // Check for new versions (021, 022, 023)
  console.log('\n🔍 Checking for new renamed versions (021, 022, 023):');
  const newResult = await client.query<AppliedMigration>(
    `SELECT version, filename FROM schema_migrations WHERE version IN ('21', '22', '23') ORDER BY version::int`
  );

  if (newResult.rows.length === 0) {
    console.log('  ℹ️  None found - ready to apply');
  } else {
    console.log(`  ✓ Found ${newResult.rows.length} record(s):`);
    newResult.rows.forEach((row) => {
      console.log(`     Version ${row.version}: ${row.filename}`);
    });
  }

} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
