import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

try {
  console.log('Adding "name" column to admin_permissions table...');
  
  await pool.query(`
    ALTER TABLE admin_permissions 
    ADD COLUMN IF NOT EXISTS name text
  `);
  
  console.log('✓ Column added');
  
} catch (error: any) {
  console.error('Error:', error.message);
  process.exit(1);
} finally {
  await pool.end();
}
