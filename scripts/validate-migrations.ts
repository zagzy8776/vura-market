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
  // The production runner wraps migrations in a transaction, including files
  // without explicit BEGIN/COMMIT. Never edit applied files solely for style;
  // their checksums are part of the deployed database's migration history.
  const explicitBegin = /^\s*BEGIN;\s*$/m.test(text);
  const explicitCommit = /^\s*COMMIT;\s*$/m.test(text);
  if (explicitBegin !== explicitCommit) throw new Error(`${file} has unmatched transaction statements`);
  seen.set(String(version), file);
  previous = version;
}

console.log(`Migration validation passed: ${files.length} files.`);
