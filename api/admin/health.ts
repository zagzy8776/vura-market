import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { applySecurityHeaders } from '../_lib/http.js';
import { randomUUID } from 'crypto';

/**
 * GET /api/admin/health
 * 
 * System health check endpoint for diagnostics.
 * No authentication required - used to diagnose system state.
 * Returns comprehensive status of database, RBAC, and migrations.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res);
  
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const requestId = randomUUID();
  const startTime = Date.now();
  
  try {
    // Check database connectivity and measure response time
    const dbStart = Date.now();
    const dbTest = await sql`SELECT 1`;
    const dbResponseTime = Date.now() - dbStart;
    const dbConnected = !!dbTest && dbTest.length > 0;

    // Check RBAC table existence
    const tablesExist: string[] = [];
    let rbacInitialized = false;
    
    try {
      const rolesCheck = await sql`SELECT 1 FROM information_schema.tables WHERE table_name='admin_roles' LIMIT 1`;
      if (rolesCheck.length > 0) tablesExist.push('admin_roles');
      
      const permsCheck = await sql`SELECT 1 FROM information_schema.tables WHERE table_name='admin_permissions' LIMIT 1`;
      if (permsCheck.length > 0) tablesExist.push('admin_permissions');
      
      const userRolesCheck = await sql`SELECT 1 FROM information_schema.tables WHERE table_name='admin_user_roles' LIMIT 1`;
      if (userRolesCheck.length > 0) tablesExist.push('admin_user_roles');
      
      const rolePermsCheck = await sql`SELECT 1 FROM information_schema.tables WHERE table_name='admin_role_permissions' LIMIT 1`;
      if (rolePermsCheck.length > 0) tablesExist.push('admin_role_permissions');
      
      rbacInitialized = tablesExist.length === 4;
    } catch (e) {
      // Tables may not exist yet
    }

    // Check if has_admin_permission function exists
    let functionExists = false;
    try {
      const funcCheck = await sql`SELECT 1 FROM information_schema.routines WHERE routine_name='has_admin_permission' LIMIT 1`;
      functionExists = funcCheck && funcCheck.length > 0;
    } catch (e) {
      // Function may not exist yet
    }

    // Check migrations status
    let migrationsCount = 0;
    let latestMigration = '';
    let migrationsStatus: 'applied' | 'pending' = 'pending';
    
    try {
      const migs = await sql`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`;
      if (migs && migs.length > 0) {
        latestMigration = migs[0].version;
        migrationsStatus = 'applied';
      }
      
      const migCount = await sql`SELECT COUNT(*)::int AS count FROM schema_migrations`;
      migrationsCount = migCount[0]?.count || 0;
    } catch (e) {
      // schema_migrations may not exist
    }

    // Determine overall status
    const allHealthy = dbConnected && rbacInitialized && functionExists && migrationsStatus === 'applied';
    const anyIssues = !dbConnected || !rbacInitialized || !functionExists;
    const status = allHealthy ? 'healthy' : anyIssues ? 'down' : 'degraded';

    const response = {
      status,
      database: {
        connected: dbConnected,
        responseTimeMs: dbResponseTime
      },
      rbac: {
        initialized: rbacInitialized,
        tablesExist,
        functionExists
      },
      migrations: {
        count: migrationsCount,
        latest: latestMigration,
        status: migrationsStatus
      },
      timestamp: new Date().toISOString(),
      requestId
    };

    res.setHeader('X-Request-ID', requestId);
    return json(res, 200, response);
  } catch (error: any) {
    const errorMsg = String(error?.message || 'Unknown error');
    
    res.setHeader('X-Request-ID', requestId);
    return json(res, 500, {
      status: 'down',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
      requestId
    });
  }
}
