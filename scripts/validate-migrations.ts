import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = join(process.cwd(), 'db', 'migrations');
const files = (await readdir(dir)).filter((name) => /^\d+_.+\.sql$/.test(name));
const seen = new Map<string, string>();
let previous = -1;

for (const file of files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
  const version = Number(file.split('_', 1)[0]);
  if (!Number.isSafeInteger(version)) throw new Error(`Invalid migration version: ${file}`);
  if (seen.has(String(version))) throw new Error(`Duplicate migration version ${version}: ${seen.get(String(version))} and ${file}`);
  if (version <= previous) throw new Error(`Migration order is not strictly increasing at ${file}`);
  const text = await readFile(join(dir, file), 'utf8');
  if (!/^BEGIN;[\s\S]*COMMIT;\s*$/m.test(text)) throw new Error(`${file} must be wrapped in BEGIN/COMMIT`);
  seen.set(String(version), file);
  previous = version;
}

console.log(`Migration validation passed: ${files.length} files.`);
