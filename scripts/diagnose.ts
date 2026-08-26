import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

try {
  // Check if schema_migrations table exists
  const tableCheck = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'schema_migrations'
    )
  `);
  
  const migrationTableExists = tableCheck.rows[0].exists;
  console.log(`\nschema_migrations table exists: ${migrationTableExists ? 'YES' : 'NO'}`);
  
  if (migrationTableExists) {
    const migrations = await pool.query(`
      SELECT version, filename, applied_at FROM schema_migrations ORDER BY version
    `);
    console.log(`\nMigrations in schema_migrations table:`);
    for (const row of migrations.rows) {
      console.log(`  [${row.version}] ${row.filename}`);
    }
  }
  
  // Check RBAC tables
  console.log(`\nChecking RBAC tables:`);
  const rbacTables = ['admin_roles', 'admin_permissions', 'admin_user_roles', 'admin_role_permissions'];
  for (const table of rbacTables) {
    const check = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = '${table}'
      )
    `);
    console.log(`  ${table}: ${check.rows[0].exists ? 'EXISTS' : 'MISSING'}`);
  }
  
  // Check function
  const funcCheck = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'has_admin_permission'
    )
  `);
  console.log(`\nhas_admin_permission() function: ${funcCheck.rows[0].exists ? 'EXISTS' : 'MISSING'}`);
  
} catch (error: any) {
  console.error('Error:', error.message);
  console.error(error.code);
} finally {
  await pool.end();
}
