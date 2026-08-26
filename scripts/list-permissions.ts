import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  console.log('\n=== Listing all admin permissions ===\n');
  
  const result = await client.query<{ code: string; name: string; description: string }>(
    `SELECT code, name, description FROM admin_permissions ORDER BY code`
  );

  if (result.rows.length === 0) {
    console.log('No permissions found in admin_permissions table.');
  } else {
    console.log(`Found ${result.rows.length} permissions:\n`);
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.code}`);
      console.log(`   Name: ${row.name}`);
      console.log(`   Description: ${row.description}\n`);
    });

    // Verify against expected permissions
    const expectedCodes = [
      'dashboard.read',
      'products.read',
      'products.create',
      'products.write',
      'suppliers.read',
      'suppliers.create',
      'suppliers.write',
      'categories.read',
      'orders.read',
      'orders.write',
      'customers.read',
      'notifications.read',
      'deliveries.read',
      'deliveries.manage',
      'finance.read',
      'refunds.create',
      'payouts.read',
      'payouts.manage'
    ];

    const actualCodes = result.rows.map(r => r.code);
    const missing = expectedCodes.filter(code => !actualCodes.includes(code));
    const extra = actualCodes.filter(code => !expectedCodes.includes(code));

    console.log('\n=== Verification ===\n');
    console.log(`Expected: ${expectedCodes.length} permissions`);
    console.log(`Actual: ${actualCodes.length} permissions`);
    
    if (missing.length > 0) {
      console.log(`\nMISSING permissions: ${missing.join(', ')}`);
    } else {
      console.log(`\n✓ All expected permissions present`);
    }

    if (extra.length > 0) {
      console.log(`\nEXTRA permissions: ${extra.join(', ')}`);
    }

    if (missing.length === 0 && extra.length === 0) {
      console.log(`\n✓ PERMISSION LIST IS COMPLETE AND CORRECT`);
    }
  }
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
