#!/usr/bin/env tsx
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function diagnose() {
  console.log('🔍 CRITICAL PRODUCTION DIAGNOSIS: Admin RBAC System\n');

  try {
    // 1. Check if RBAC tables exist
    console.log('1️⃣ DATABASE SCHEMA VERIFICATION:');
    const tables = await sql`
      SELECT tablename FROM pg_tables 
      WHERE tablename IN ('admin_roles', 'admin_permissions', 'admin_user_roles', 'admin_role_permissions')
      ORDER BY tablename
    `;
    console.log(`   Tables found: ${tables.map((t: any) => t.tablename).join(', ') || 'NONE'}`);
    if (tables.length < 4) {
      console.error(`   ❌ CRITICAL: Missing ${4 - tables.length} RBAC tables`);
    }

    // 2. Check if has_admin_permission function exists
    console.log('\n2️⃣ RBAC FUNCTION CHECK:');
    const func = await sql`SELECT proname FROM pg_proc WHERE proname = 'has_admin_permission'`;
    if (func.length === 0) {
      console.error('   ❌ CRITICAL: has_admin_permission() function NOT FOUND');
    } else {
      console.log('   ✅ has_admin_permission() function exists');
    }

    // 3. Check data integrity
    console.log('\n3️⃣ DATA INTEGRITY CHECK:');
    const [rolesResult, permResult, userRoleResult] = await Promise.all([
      sql`SELECT id, name FROM admin_roles ORDER BY name`,
      sql`SELECT id, code FROM admin_permissions ORDER BY code`,
      sql`SELECT COUNT(*)::int as count FROM admin_user_roles`,
    ]);

    console.log(`   Roles: ${rolesResult.length}`);
    rolesResult.forEach((r: any) => console.log(`      - ${r.name}`));

    const ownerRole = rolesResult.find((r: any) => r.name === 'owner');
    if (!ownerRole) {
      console.error('   ❌ CRITICAL: "owner" role does not exist');
    } else {
      console.log('   ✅ "owner" role exists');
    }

    console.log(`\n   Permissions: ${permResult.length}`);
    if (permResult.length === 0) {
      console.error('   ❌ CRITICAL: No permissions defined');
    } else {
      const expectedPerms = [
        'dashboard.read', 'products.read', 'products.create', 'products.write',
        'suppliers.read', 'suppliers.create', 'suppliers.write',
        'categories.read', 'orders.read', 'orders.write',
        'customers.read', 'notifications.read', 'finance.read',
        'deliveries.read', 'deliveries.manage'
      ];
      const foundCodes = permResult.map((p: any) => p.code);
      const missing = expectedPerms.filter((p: string) => !foundCodes.includes(p));
      if (missing.length > 0) {
        console.error(`   ❌ Missing permissions: ${missing.join(', ')}`);
      } else {
        console.log('   ✅ All expected permissions present');
      }
    }

    console.log(`\n   Admin user role assignments: ${(userRoleResult[0] as any).count}`);
    if ((userRoleResult[0] as any).count === 0) {
      console.error('   ❌ CRITICAL: No admin users assigned to any role');
    }

    // 4. Check admin users
    console.log('\n4️⃣ ADMIN USERS:');
    const adminUsers = await sql`SELECT id, name, email, role FROM users WHERE role = 'admin' LIMIT 10`;
    console.log(`   Total admin users: ${adminUsers.length}`);
    if (adminUsers.length === 0) {
      console.error('   ❌ CRITICAL: No admin users in users table');
    } else {
      adminUsers.forEach((u: any) => console.log(`      - ${u.name} (${u.email})`));
    }

    // 5. Check owner role assignment
    console.log('\n5️⃣ OWNER ROLE ASSIGNMENTS:');
    const ownerAssignments = await sql`
      SELECT ur.user_id, u.name, u.email, r.name as role_name
      FROM admin_user_roles ur 
      JOIN users u ON u.id = ur.user_id
      JOIN admin_roles r ON r.id = ur.role_id
      WHERE r.name = 'owner'
    `;
    console.log(`   Users with owner role: ${ownerAssignments.length}`);
    if (ownerAssignments.length === 0 && adminUsers.length > 0) {
      console.error('   ❌ CRITICAL: Admin users exist but NONE assigned to owner role');
    } else {
      ownerAssignments.forEach((a: any) => console.log(`      - ${a.name} (${a.email})`));
    }

    // 6. Test permission check
    console.log('\n6️⃣ PERMISSION CHECK TEST:');
    if (adminUsers.length > 0 && func.length > 0) {
      const testUserId = adminUsers[0].id;
      try {
        const result = await sql`SELECT has_admin_permission(${testUserId}::uuid, 'dashboard.read') as allowed`;
        console.log(`   Test user ${adminUsers[0].name}: dashboard.read = ${(result[0] as any).allowed}`);
        if (!(result[0] as any).allowed) {
          console.error('   ❌ CRITICAL: Test user has NO permissions (should have dashboard.read)');
        }
      } catch (e) {
        console.error(`   ❌ Error calling has_admin_permission: ${(e as any).message}`);
      }
    }

    // 7. Check migrations
    console.log('\n7️⃣ MIGRATION STATUS:');
    const migrations = await sql`
      SELECT version, filename FROM schema_migrations 
      WHERE version IN ('001', '007', '019', '020') 
      ORDER BY version::int
    `;
    console.log('   Critical migrations:');
    const migMap = migrations.reduce((m: any, v: any) => { m[v.version] = v.filename; return m; }, {});
    ['001', '007', '019', '020'].forEach((v: string) => {
      if (migMap[v]) {
        console.log(`      ✅ [${v}] ${migMap[v]}`);
      } else {
        console.error(`      ❌ [${v}] NOT APPLIED`);
      }
    });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('ROOT CAUSE ANALYSIS:');
    const issues = [];
    if (tables.length < 4) issues.push('Missing RBAC tables');
    if (func.length === 0) issues.push('Missing has_admin_permission function');
    if (permResult.length === 0) issues.push('No permissions seeded');
    if ((userRoleResult[0] as any).count === 0 && adminUsers.length > 0) issues.push('Admin users not assigned to roles');
    
    if (issues.length === 0) {
      console.log('✅ RBAC System appears healthy - check application logs for detailed errors');
    } else {
      console.log('❌ Found issues:');
      issues.forEach((i: string) => console.log(`   - ${i}`));
    }

  } catch (error) {
    console.error('❌ Database connection failed:', (error as any).message);
    process.exit(1);
  }
}

diagnose().catch(console.error);
