import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const sql = neon(databaseUrl);

async function main() {
  // Test a simple CREATE TABLE
  try {
    await sql.unsafe('CREATE TABLE IF NOT EXISTS test_simple (id int PRIMARY KEY, name text)');
    const result = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'test_simple'`;
    console.log('test_simple exists:', JSON.stringify(result));
  } catch (e) {
    console.log('Error:', e instanceof Error ? e.message : String(e));
  }

  // Test CREATE TABLE with DEFAULT gen_random_uuid()
  try {
    await sql.unsafe('CREATE TABLE IF NOT EXISTS test_uuid (id uuid PRIMARY KEY DEFAULT gen_random_uuid())');
    console.log('test_uuid created OK');
    const result = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'test_uuid'`;
    console.log('test_uuid exists:', JSON.stringify(result));
  } catch (e) {
    console.log('test_uuid error:', e instanceof Error ? e.message : String(e));
  }

  // Test a multi-column CREATE TABLE like products
  try {
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS test_multi (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      price_kobo bigint NOT NULL
    )`);
    console.log('test_multi created OK');
  } catch (e) {
    console.log('test_multi error:', e instanceof Error ? e.message : String(e));
  }

  // Check all tables
  const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  console.log('\nAll tables:', JSON.stringify(tables.map((t: { tablename: string }) => t.tablename)));

  // Cleanup
  await sql.unsafe('DROP TABLE IF EXISTS test_simple, test_uuid, test_multi');
  console.log('\nCleanup done');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});




