import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  console.log('=== Admin Permissions Verification ===\n');

  // Check if admin_permissions table exists
  const tableCheck = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_permissions') as exists`
  );
  
  if (!tableCheck.rows[0]?.exists) {
    console.log('❌ admin_permissions table does not exist');
    process.exit(1);
  }
  
  console.log('✅ admin_permissions table exists\n');

  // Count total permissions
  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM admin_permissions`
  );
  const count = parseInt(countResult.rows[0]?.count ?? '0', 10);
  console.log(`Total permissions in database: ${count}`);
  
  if (count < 18) {
    console.log('⚠️  WARNING: Expected at least 18 permissions, found ' + count);
  } else {
    console.log('✅ Count is at or above minimum (18+)\n');
  }

  // List all permission codes
  const codesResult = await client.query<{ code: string }>(
    `SELECT code FROM admin_permissions ORDER BY code`
  );
  
  console.log('\nAll permission codes in database:');
  const codes = codesResult.rows.map(r => r.code);
  codes.forEach(code => console.log(`  - ${code}`));

  // Expected codes
  const expectedCodes = [
    'dashboard.read',
    'products.read',
    'products.create',
    'products.write',
    'orders.read',
    'orders.write',
    'suppliers.read',
    'suppliers.create',
    'suppliers.write',
    'categories.read',
    'customers.read',
    'notifications.read',
    'deliveries.read',
    'finance.read',
    'refunds.create',
    'deliveries.manage'
  ];

  console.log('\n=== Required Codes Verification ===\n');
  
  const missingCodes: string[] = [];
  expectedCodes.forEach(expected => {
    if (codes.includes(expected)) {
      console.log(`✅ ${expected}`);
    } else {
      console.log(`❌ ${expected} - MISSING`);
      missingCodes.push(expected);
    }
  });

  if (missingCodes.length > 0) {
    console.log(`\n⚠️  Missing ${missingCodes.length} required permission codes:`);
    missingCodes.forEach(code => console.log(`  - ${code}`));
  } else {
    console.log('\n✅ All required permission codes are present');
  }

} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
