import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = neon(connectionString);
const schema = readFileSync('./db/schema.sql', 'utf-8');
const statements = schema.split(';').map((s) => s.trim()).filter((s) => s.length > 0);

for (const statement of statements) {
  try {
    await sql.query(statement);
    console.log('OK:', statement.slice(0, 80).replace(/\n/g, ' '));
  } catch (err) {
    console.error('ERR:', err.message, '|', statement.slice(0, 80).replace(/\n/g, ' '));
  }
}

console.log('Schema application complete.');
