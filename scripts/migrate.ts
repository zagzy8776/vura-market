import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const sql = neon(databaseUrl);
const migrationsDir = join(process.cwd(), 'db', 'migrations');

const files = (await readdir(migrationsDir))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (!files.length) throw new Error('No migrations found');

await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    filename text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

const applied = await sql`SELECT version, filename, checksum FROM schema_migrations ORDER BY version`;
const byVersion = new Map(applied.map((row: any) => [String(row.version), row]));

for (const filename of files) {
  const version = filename.split('_', 1)[0];
  const contents = await readFile(join(migrationsDir, filename), 'utf8');
  const checksum = createHash('sha256').update(contents).digest('hex');
  const existing = byVersion.get(version);

  if (existing) {
    if (existing.filename !== filename || existing.checksum !== checksum) {
      throw new Error(`Migration ${version} has changed after application: ${existing.filename}`);
    }
    continue;
  }

  console.log(`Applying ${filename}`);
  await sql.unsafe(contents);
  await sql`
    INSERT INTO schema_migrations(version, filename, checksum)
    VALUES(${version}, ${filename}, ${checksum})
  `;
}

console.log(`Migration check complete: ${files.length} migration files inspected.`);
