import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

try {
  const result = await pool.query(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' AND tablename LIKE '%track%'
  `);
  
  console.log('\nTables with "track" in name:');
  for (const row of result.rows) {
    console.log(`  ${row.tablename}`);
  }
  
  if (result.rows.length === 0) {
    console.log('  (none found)');
  }
  
} catch (error: any) {
  console.error('Error:', error.message);
} finally {
  await pool.end();
}
