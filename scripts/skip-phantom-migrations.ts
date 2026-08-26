import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

try {
  console.log('Removing phantom migration records for versions 014, 015, 022, 023...');
  
  const result = await pool.query(`
    DELETE FROM schema_migrations 
    WHERE version IN ('014', '015', '022', '023')
  `);
  
  console.log(`✓ Deleted ${result.rowCount} records`);
  
} catch (error: any) {
  console.error('Error:', error.message);
  process.exit(1);
} finally {
  await pool.end();
}
