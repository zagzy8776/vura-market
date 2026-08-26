import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  console.log('\n=== PHASE 0.1a: RBAC Schema Recovery ===\n');
  
  // Step 1: Update migration 000 to match actual filename
  console.log('Step 1: Fixing migration 000 filename mismatch...');
  const fixMigration000 = await client.query(`
    UPDATE schema_migrations 
    SET filename = '000_migration_runner.sql'
    WHERE version = '000' AND filename = '000_applied_via_schema.sql'
  `);
  console.log(`  Updated ${fixMigration000.rowCount} records`);
  
  // Step 2: Delete false RBAC migration records  
  console.log('\nStep 2: Deleting false RBAC migration records...');
  const versions = ['001', '007', '019', '020', '021', '024', '025', '026'];
  const deleteResult = await client.query(
    `DELETE FROM schema_migrations WHERE version = ANY($1)`,
    [versions]
  );
  console.log(`  Deleted ${deleteResult.rowCount} migration records for versions: ${versions.join(', ')}`);
  
  // Step 3: List remaining migrations
  console.log('\nStep 3: Remaining migrations after cleanup:');
  const remaining = await client.query(`
    SELECT version FROM schema_migrations ORDER BY version
  `);
  console.log(`  ${remaining.rows.map((r: any) => r.version).join(', ')}`);
  
  console.log('\n✓ Recovery preparation complete');
  console.log('\nNext steps:');
  console.log('  1. Run: npm run db:migrate');
  console.log('  2. This will re-apply migrations 001, 007, 019, 020, etc.');
  console.log('  3. Then verify with: npx tsx scripts/diagnose.ts');
  
} catch (error: any) {
  console.error('\n❌ Error during recovery:', error.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
