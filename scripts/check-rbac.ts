import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

try {
  console.log('\n=== RBAC Schema Verification ===\n');
  
  // Check RBAC tables
  const tablesResult = await pool.query(`
    SELECT tablename FROM pg_tables 
    WHERE tablename IN ('admin_roles', 'admin_permissions', 'admin_user_roles', 'admin_role_permissions')
    ORDER BY tablename
  `);
  
  const foundTables = new Set(tablesResult.rows.map((r: any) => r.tablename));
  const requiredTables = ['admin_roles', 'admin_permissions', 'admin_user_roles', 'admin_role_permissions'];
  
  console.log('RBAC Tables:');
  for (const table of requiredTables) {
    console.log(`  ${table}: ${foundTables.has(table) ? '✓ EXISTS' : '❌ MISSING'}`);
  }
  
  // Check function
  const funcResult = await pool.query(`
    SELECT proname FROM pg_proc WHERE proname = 'has_admin_permission'
  `);
  const funcExists = funcResult.rows.length > 0;
  console.log(`\nFunction:
  has_admin_permission(): ${funcExists ? '✓ EXISTS' : '❌ MISSING'}`);
  
  // Check migration status
  const migResult = await pool.query(`
    SELECT version, applied_at FROM schema_migrations 
    WHERE version IN ('001', '007', '019', '020', '021', '024', '025', '026')
    ORDER BY version
  `);
  
  console.log(`\nMigration Status (recorded in schema_migrations):`);
  for (const row of migResult.rows) {
    console.log(`  ${row.version}: ${row.applied_at}`);
  }
  
  const allTablesExist = foundTables.size === 4;
  const needsRecovery = !allTablesExist || !funcExists;
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Tables exist: ${allTablesExist ? '✓ YES' : '❌ NO'}`);
  console.log(`Function exists: ${funcExists ? '✓ YES' : '❌ NO'}`);
  console.log(`Recovery needed: ${needsRecovery ? '✓ YES' : '❌ NO'}`);
  
  process.exit(needsRecovery ? 1 : 0);
  
} catch (error: any) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
} finally {
  await pool.end();
}
