import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

try {
  console.log('Fixing migration 000 checksum...');
  
  // Read the actual migration file
  const migrationsDir = join(process.cwd(), 'db', 'migrations');
  const contents = await readFile(join(migrationsDir, '000_migration_runner.sql'), 'utf8');
  const checksum = createHash('sha256').update(contents).digest('hex');
  
  console.log(`Calculated checksum for 000_migration_runner.sql: ${checksum}`);
  
  // Update the database
  const result = await pool.query(
    'UPDATE schema_migrations SET checksum = $1 WHERE version = $2',
    [checksum, '000']
  );
  
  console.log(`Updated ${result.rows} records`);
  console.log('✓ Checksum fixed');
  
} catch (error: any) {
  console.error('Error:', error.message);
  process.exit(1);
} finally {
  await pool.end();
}
