import { Pool } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  console.log('Manually applying migration 006...');
  
  // Read the migration file
  const contents = await readFile(join(process.cwd(), 'db', 'migrations', '006_order_tracking_lifecycle.sql'), 'utf8');
  
  // Execute it
  await client.query(contents);
  
  console.log('✓ Migration 006 applied successfully');
  
} catch (error: any) {
  console.error('Error:', error.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
