import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

type AppliedMigration = { version: string; filename: string; checksum: string };

const versionsToCheck = ['6', '12', '13'];

const client = await pool.connect();
try {
  console.log('Checking schema_migrations table for conflicting versions...\n');

  const result = await client.query<AppliedMigration>(
    `SELECT version, filename, checksum FROM schema_migrations WHERE version = ANY($1) ORDER BY version`,
    [versionsToCheck]
  );

  if (result.rows.length === 0) {
    console.log('✓ No conflicting migration records found. The database is clean.');
    console.log('The new migrations (019-023) can be applied safely.');
  } else {
    console.log(`Found ${result.rows.length} conflicting migration record(s):\n`);
    result.rows.forEach((row) => {
      console.log(`  Version ${row.version}:`);
      console.log(`    Filename: ${row.filename}`);
      console.log(`    Checksum: ${row.checksum}`);
    });

    console.log('\n⚠️  IMPORTANT: Before deletion, verify:');
    console.log('1. These old migrations HAVE been applied (the schema reflects their changes)');
    console.log('2. The new filenames (021, 022, 023) are ready to be applied');
    console.log('3. You have a backup of your database');

    console.log('\n📋 Proposed Action: DELETE the old records');
    console.log(`   SQL: DELETE FROM schema_migrations WHERE version IN ('${versionsToCheck.join("', '")}');\n`);

    // Uncomment the following section only after manual verification:
    const confirmDelete = process.env.CONFIRM_DELETE === 'true';
    if (confirmDelete) {
      console.log('Executing deletion...');
      const deleteResult = await client.query(
        `DELETE FROM schema_migrations WHERE version = ANY($1)`,
        [versionsToCheck]
      );
      console.log(`✓ Deleted ${deleteResult.rowCount} record(s)\n`);

      // Verify deletion
      const verifyResult = await client.query<AppliedMigration>(
        `SELECT version, filename, checksum FROM schema_migrations WHERE version = ANY($1) ORDER BY version`,
        [versionsToCheck]
      );
      if (verifyResult.rows.length === 0) {
        console.log('✓ Verification successful: All conflicting records have been removed.');
        console.log('✓ The database is now ready for the new migrations (021, 022, 023).');
      }
    } else {
      console.log('To execute the deletion, run with: CONFIRM_DELETE=true npm run fix-migrations');
    }
  }
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
