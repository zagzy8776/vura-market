import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

async function verifyRBACData() {
  const client = await pool.connect();
  try {
    console.log('Connecting to database...');
    
    // Test connection
    await client.query('SELECT 1');
    console.log('✓ Database connected\n');

    // Query 1: Check admin_user_roles count
    console.log('Query 1: SELECT COUNT(*) FROM admin_user_roles');
    const countResult = await client.query<{ count: string }>(
      'SELECT COUNT(*) FROM admin_user_roles'
    );
    const userRolesCount = parseInt(countResult.rows[0].count, 10);
    console.log(`Result: ${userRolesCount} assignments\n`);

    if (userRolesCount < 1) {
      console.log('⚠ WARNING: No admin user role assignments found\n');
      
      // Check if there are any admin users
      console.log('Checking for admin users...');
      const adminUsersResult = await client.query<{ id: string; email: string; role: string }>(
        `SELECT id, email, role FROM users WHERE role = 'admin'`
      );
      console.log(`Found ${adminUsersResult.rows.length} admin users:`);
      adminUsersResult.rows.forEach(user => {
        console.log(`  - ID: ${user.id}, Email: ${user.email}, Role: ${user.role}`);
      });
      console.log();

      // Check available roles
      console.log('Checking available roles...');
      const rolesResult = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM admin_roles`
      );
      console.log(`Found ${rolesResult.rows.length} roles:`);
      rolesResult.rows.forEach(role => {
        console.log(`  - ID: ${role.id}, Name: ${role.name}`);
      });
      console.log();
    } else {
      console.log(`✓ Found ${userRolesCount} admin user role assignment(s)\n`);
    }

    // Query 2: Show all assignments
    console.log('Query 2: SELECT * FROM admin_user_roles');
    const allAssignmentsResult = await client.query<{ user_id: string; role_id: string }>(
      `SELECT user_id, role_id FROM admin_user_roles`
    );
    
    if (allAssignmentsResult.rows.length === 0) {
      console.log('Result: No assignments found\n');
    } else {
      console.log('Results:');
      allAssignmentsResult.rows.forEach(assignment => {
        console.log(`  - User ID: ${assignment.user_id}, Role ID: ${assignment.role_id}`);
      });
      console.log();
    }

    // Enhanced query with user and role info
    console.log('Query 3: Detailed view with user email and role name');
    const detailedResult = await client.query<{ 
      user_email: string; 
      role_name: string; 
    }>(
      `SELECT 
        u.email as user_email,
        r.name as role_name
       FROM admin_user_roles aur
       JOIN users u ON u.id = aur.user_id
       JOIN admin_roles r ON r.id = aur.role_id
       ORDER BY r.name, u.email`
    );
    
    if (detailedResult.rows.length === 0) {
      console.log('Result: No assignments found\n');
    } else {
      console.log('Results:');
      detailedResult.rows.forEach(assignment => {
        console.log(`  - User: ${assignment.user_email}, Role: ${assignment.role_name}`);
      });
      console.log();
    }

    // Summary
    console.log('=== TASK 2 VERIFICATION SUMMARY ===');
    if (userRolesCount >= 1) {
      console.log('✓ PASS: At least 1 admin user assigned to a role');
    } else {
      console.log('✗ FAIL: No admin user role assignments found');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

verifyRBACData().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
