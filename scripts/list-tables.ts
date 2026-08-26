import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

try {
  const result = await pool.query(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  
  console.log('\nTables in public schema:');
  for (const row of result.rows) {
    console.log(`  ${row.tablename}`);
  }
  console.log(`\nTotal: ${result.rows.length} tables`);
  
} catch (error: any) {
  console.error('Error:', error.message);
} finally {
  await pool.end();
}
