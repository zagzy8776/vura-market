import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from '@neondatabase/serverless';

type AppliedMigration = { version: string; filename: string; checksum: string };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
const migrationsDir = join(process.cwd(), 'db', 'migrations');

function migrationVersion(filename: string) {
  return filename.split('_', 1)[0];
}

function validateMigrationFiles(files: string[]) {
  const seen = new Set<number>();
  let previous = -1;
  for (const filename of files) {
    const version = Number.parseInt(migrationVersion(filename), 10);
    if (!Number.isSafeInteger(version)) throw new Error(`Invalid migration version: ${filename}`);
    if (seen.has(version)) throw new Error(`Duplicate migration version: ${version}`);
    if (version <= previous) throw new Error(`Migration order is not strictly increasing at ${filename}`);
    seen.add(version);
    previous = version;
  }
}

const files = (await readdir(migrationsDir))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (!files.length) throw new Error('No migrations found');
validateMigrationFiles(files);

const client = await pool.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      filename text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const appliedResult = await client.query<AppliedMigration>(
    'SELECT version, filename, checksum FROM schema_migrations ORDER BY version',
  );
  const applied = new Map(appliedResult.rows.map((row) => [row.version, row]));

  for (const filename of files) {
    const version = migrationVersion(filename);
    const contents = await readFile(join(migrationsDir, filename), 'utf8');
    const checksum = createHash('sha256').update(contents).digest('hex');
    const existing = applied.get(version);

    if (existing) {
      if (existing.filename !== filename || existing.checksum !== checksum) {
        throw new Error(`Migration ${version} has changed after application: ${existing.filename}`);
      }
      continue;
    }

    console.log(`Applying ${filename}`);
    await client.query('BEGIN');
    try {
      // Use the PostgreSQL client for multi-statement migration files.
      // The Neon HTTP tagged-template helper executes a single statement per request.
      await client.query(contents);
      await client.query(
        'INSERT INTO schema_migrations(version, filename, checksum) VALUES ($1, $2, $3)',
        [version, filename, checksum],
      );
      await client.query('COMMIT');
      applied.set(version, { version, filename, checksum });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  console.log(`Migration check complete: ${files.length} migration files inspected.`);
} finally {
  client.release();
  await pool.end();
}
