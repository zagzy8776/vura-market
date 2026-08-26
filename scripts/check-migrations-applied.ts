import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

try {
  const result = await pool.query(`
    SELECT version FROM schema_migrations ORDER BY version::integer
  `);
  
  console.log('\nApplied migrations:');
  const versions = result.rows.map((r: any) => r.version);
  console.log(versions.join(', '));
  
  // Check which ones are missing
  const expected = [];
  for (let i = 0; i <= 26; i++) {
    expected.push(String(i).padStart(3, '0'));
  }
  
  const missing = expected.filter(v => !versions.includes(v));
  console.log(`\nMissing migrations: ${missing.join(', ')}`);
  
} catch (error: any) {
  console.error('Error:', error.message);
} finally {
  await pool.end();
}
