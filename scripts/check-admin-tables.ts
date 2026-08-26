import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  const result = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name LIKE 'admin_%'
    ORDER BY table_name
  `);

  console.log('🔍 Admin tables in production database:\n');
  if (result.rows.length === 0) {
    console.log('❌ No admin tables found');
  } else {
    result.rows.forEach((row) => {
      console.log(`✓ ${row.table_name}`);
    });
  }

  // Check all tables
  const allTables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  console.log(`\n📊 Total tables in production: ${allTables.rows.length}`);
} finally {
  client.release();
  await pool.end();
}
