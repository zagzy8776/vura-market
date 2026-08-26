import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

try {
  // Check admin_permissions schema
  const schema = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'admin_permissions'
    ORDER BY ordinal_position
  `);
  
  console.log('\nadmin_permissions schema:');
  for (const col of schema.rows) {
    console.log(`  ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
  }
  
  // Check admin_roles schema
  const roleSchema = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'admin_roles'
    ORDER BY ordinal_position
  `);
  
  console.log('\nadmin_roles schema:');
  for (const col of roleSchema.rows) {
    console.log(`  ${col.column_name} (${col.data_type})`);
  }
  
  // Count rows
  const perms = await pool.query('SELECT COUNT(*) FROM admin_permissions');
  const roles = await pool.query('SELECT COUNT(*) FROM admin_roles');
  console.log(`\nadmin_permissions: ${perms.rows[0].count} rows`);
  console.log(`admin_roles: ${roles.rows[0].count} rows`);
  
} catch (error: any) {
  console.error('Error:', error.message);
} finally {
  await pool.end();
}
