import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  console.log('\n=== PHASE 0.1a: RBAC Schema Verification & Recovery ===\n');

  // Step 1: Check if RBAC tables exist
  console.log('Step 1: Checking if RBAC tables exist...');
  const tablesResult = await client.query(`
    SELECT tablename FROM pg_tables 
    WHERE tablename IN ('admin_roles', 'admin_permissions', 'admin_user_roles', 'admin_role_permissions')
  `);
  
  const existingTables = tablesResult.rows.map((r: any) => r.tablename);
  console.log(`  Found: ${existingTables.length === 0 ? 'NO TABLES FOUND ❌' : existingTables.join(', ')}`);
  
  // Step 2: Check if has_admin_permission() function exists
  console.log('\nStep 2: Checking if has_admin_permission() function exists...');
  const functionResult = await client.query(`
    SELECT proname FROM pg_proc WHERE proname = 'has_admin_permission'
  `);
  
  const functionExists = functionResult.rows.length > 0;
  console.log(`  has_admin_permission(): ${functionExists ? 'EXISTS ✓' : 'MISSING ❌'}`);
  
  // Step 3: Check schema_migrations status
  console.log('\nStep 3: Checking schema_migrations for key versions...');
  const migrationsResult = await client.query(`
    SELECT version, filename, applied_at FROM schema_migrations 
    WHERE version IN ('001', '007', '019', '020', '021', '024', '025', '026')
    ORDER BY version
  `);
  
  console.log(`  Migration records found:`);
  for (const row of migrationsResult.rows) {
    console.log(`    [${row.version}] ${row.filename} - ${row.applied_at}`);
  }
  
  // Decision Point
  const needsRecovery = existingTables.length < 4 || !functionExists;
  
  if (!needsRecovery) {
    console.log('\n✓ All RBAC tables and function exist. Recovery not needed.');
    console.log('Proceeding to Task 2: Verify RBAC Data');
  } else {
    console.log('\n❌ RBAC schema incomplete. Executing recovery...\n');
    
    // Recovery Step 1: Delete false migration records
    console.log('Recovery Step 1: Deleting false migration records...');
    const deleteResult = await client.query(`
      DELETE FROM schema_migrations 
      WHERE version IN ('001', '007', '019', '020', '021', '024', '025', '026')
    `);
    console.log(`  Deleted ${deleteResult.rowCount} migration records`);
    
    // Recovery Step 2: Re-run migrations (this will be done by npm run db:migrate)
    console.log('\nRecovery Step 2: Will re-run migrations via npm run db:migrate');
    console.log('  (This must be executed from the project root)');
    console.log('\n  Command: npm run db:migrate\n');
    
    // Export data for the user to see
    console.log('\n=== RECOVERY ACTIONS REQUIRED ===');
    console.log('1. Run this command from project root:');
    console.log('   npm run db:migrate\n');
    console.log('2. After migrations complete, run verification:');
    console.log('   npm run db:verify-migrations\n');
  }
  
  console.log('\n=== VERIFICATION SUMMARY ===');
  console.log(`admin_roles table:            ${existingTables.includes('admin_roles') ? '✓' : '❌'}`);
  console.log(`admin_permissions table:      ${existingTables.includes('admin_permissions') ? '✓' : '❌'}`);
  console.log(`admin_user_roles table:       ${existingTables.includes('admin_user_roles') ? '✓' : '❌'}`);
  console.log(`admin_role_permissions table: ${existingTables.includes('admin_role_permissions') ? '✓' : '❌'}`);
  console.log(`has_admin_permission() func:  ${functionExists ? '✓' : '❌'}`);
  
  process.exit(needsRecovery ? 1 : 0);
  
} catch (error: any) {
  console.error('❌ Error during verification:', error.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
