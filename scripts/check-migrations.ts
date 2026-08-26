import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

try {
  const result = await pool.query(`
    SELECT version, filename, applied_at FROM schema_migrations 
    ORDER BY version
  `);
  
  console.log('\nApplied Migrations:');
  console.log('─'.repeat(80));
  for (const row of result.rows) {
    console.log(`${row.version.padEnd(6)} | ${row.filename.padEnd(50)} | ${row.applied_at}`);
  }
  console.log('─'.repeat(80));
  console.log(`Total: ${result.rows.length} migrations recorded\n`);
  
} catch (error: any) {
  console.error('Error:', error.message);
} finally {
  await pool.end();
}
