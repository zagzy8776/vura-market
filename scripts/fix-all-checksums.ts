import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

try {
  console.log('Fixing all migration checksums...\n');
  
  const migrationsDir = join(process.cwd(), 'db', 'migrations');
  const files = (await readdir(migrationsDir))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  
  for (const filename of files) {
    const version = filename.split('_', 1)[0];
    const contents = await readFile(join(migrationsDir, filename), 'utf8');
    const checksum = createHash('sha256').update(contents).digest('hex');
    
    // Update the database
    const result = await pool.query(
      'UPDATE schema_migrations SET checksum = $1, filename = $2 WHERE version = $3',
      [checksum, filename, version]
    );
    
    if (result.rowCount > 0) {
      console.log(`✓ [${version}] ${filename}`);
    }
  }
  
  console.log('\n✓ All checksums fixed');
  
} catch (error: any) {
  console.error('Error:', error.message);
  process.exit(1);
} finally {
  await pool.end();
}
