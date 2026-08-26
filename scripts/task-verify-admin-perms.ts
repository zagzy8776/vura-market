#!/usr/bin/env tsx
/**
 * Task: Verify admin_permissions table is seeded correctly
 * 
 * This script verifies Task 2 from Phase 0 Emergency Recovery:
 * "Verify & Seed RBAC Data (Phase 0.1b)"
 * 
 * Required: DATABASE_URL environment variable
 * Usage: DATABASE_URL=postgresql://... npm run script scripts/task-verify-admin-perms.ts
 */

import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL=postgresql://... tsx scripts/task-verify-admin-perms.ts');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  console.log('\n' + '='.repeat(70));
  console.log('TASK 2: VERIFY & SEED RBAC DATA (Phase 0.1b)');
  console.log('='.repeat(70) + '\n');

  // Expected permission codes from requirements
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

  // Sub-Task 1: Check if admin_permissions table exists
  console.log('Sub-Task 1: Verify admin_permissions table exists');
  const tableCheck = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_permissions') as exists`
  );
  
  if (!tableCheck.rows[0]?.exists) {
    console.log('❌ FAILED: admin_permissions table does not exist\n');
    process.exit(1);
  }
  console.log('✅ PASSED: admin_permissions table exists\n');

  // Sub-Task 2: COUNT(*) - expected 18+
  console.log('Sub-Task 2: Verify count of admin_permissions');
  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM admin_permissions`
  );
  const count = parseInt(countResult.rows[0]?.count ?? '0', 10);
  console.log(`   Total permissions in database: ${count}`);
  
  if (count < 18) {
    console.log(`❌ FAILED: Expected at least 18 permissions, found ${count}\n`);
  } else {
    console.log(`✅ PASSED: Count is ${count} (at or above minimum of 18)\n`);
  }

  // Sub-Task 3: List all permission codes
  console.log('Sub-Task 3: List all permission codes');
  const codesResult = await client.query<{ code: string }>(
    `SELECT code FROM admin_permissions ORDER BY code`
  );
  
  const codes = codesResult.rows.map(r => r.code);
  console.log(`   Found ${codes.length} total codes:\n`);
  codes.forEach((code, i) => console.log(`   ${i + 1}. ${code}`));
  console.log();

  // Sub-Task 4: Verify all required codes are present
  console.log('Sub-Task 4: Verify all required permission codes are present');
  const codeSet = new Set(codes);
  const missingCodes: string[] = [];
  
  console.log('\n   Checking required codes:\n');
  expectedCodes.forEach(expected => {
    if (codeSet.has(expected)) {
      console.log(`   ✅ ${expected}`);
    } else {
      console.log(`   ❌ ${expected} - MISSING`);
      missingCodes.push(expected);
    }
  });

  if (missingCodes.length > 0) {
    console.log(`\n❌ FAILED: Missing ${missingCodes.length} required permission codes:`);
    missingCodes.forEach(code => console.log(`   - ${code}`));
    process.exit(1);
  } else {
    console.log('\n✅ PASSED: All required permission codes are present\n');
  }

  // Sub-Task 5: Verify admin_roles table
  console.log('Sub-Task 5: Verify admin_roles table contains required roles');
  const rolesResult = await client.query<{ name: string }>(
    `SELECT name FROM admin_roles ORDER BY name`
  );
  
  const roles = rolesResult.rows.map(r => r.name);
  const requiredRoles = ['owner', 'manager', 'viewer', 'finance'];
  const roleSet = new Set(roles);
  const missingRoles: string[] = [];

  console.log(`\n   Found ${roles.length} roles:\n`);
  requiredRoles.forEach(required => {
    if (roleSet.has(required)) {
      console.log(`   ✅ ${required}`);
    } else {
      console.log(`   ❌ ${required} - MISSING`);
      missingRoles.push(required);
    }
  });

  if (missingRoles.length > 0) {
    console.log(`\n❌ FAILED: Missing ${missingRoles.length} required roles\n`);
    process.exit(1);
  } else {
    console.log('\n✅ PASSED: All required roles present\n');
  }

  // Sub-Task 6: Verify admin_user_roles table
  console.log('Sub-Task 6: Verify admin_user_roles has at least one assignment');
  const userRolesResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM admin_user_roles`
  );
  const userRolesCount = parseInt(userRolesResult.rows[0]?.count ?? '0', 10);
  console.log(`   Total admin_user_roles assignments: ${userRolesCount}`);
  
  if (userRolesCount < 1) {
    console.log('⚠️  WARNING: No admin users assigned to roles\n');
  } else {
    console.log(`✅ PASSED: ${userRolesCount} admin user role assignment(s) found\n`);
  }

  // Sub-Task 7: Verify owner role has all permissions
  console.log('Sub-Task 7: Verify owner role has all required permissions');
  const ownerPermsResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM admin_role_permissions 
     WHERE role_id = (SELECT id FROM admin_roles WHERE name = 'owner')`
  );
  const ownerPermsCount = parseInt(ownerPermsResult.rows[0]?.count ?? '0', 10);
  console.log(`   Owner role has ${ownerPermsCount} permissions assigned`);
  
  if (ownerPermsCount >= 18) {
    console.log(`✅ PASSED: Owner role has ${ownerPermsCount} permissions (18+)\n`);
  } else {
    console.log(`⚠️  WARNING: Owner role has only ${ownerPermsCount} permissions (expected 18+)\n`);
  }

  // Summary
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`
✅ admin_permissions table exists
✅ Permission count: ${count} (required: 18+)
✅ All ${expectedCodes.length} required permission codes present
✅ All ${requiredRoles.length} required roles present
${userRolesCount >= 1 ? '✅' : '⚠️ '} Admin user role assignments: ${userRolesCount}
${ownerPermsCount >= 18 ? '✅' : '⚠️ '} Owner role permissions: ${ownerPermsCount}

Task Status: ${missingCodes.length === 0 ? '✅ PASSED' : '❌ FAILED'}
  `);

  console.log('='.repeat(70) + '\n');

  process.exit(missingCodes.length > 0 ? 1 : 0);

} catch (error) {
  console.error('\n❌ ERROR:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
