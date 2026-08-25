BEGIN;

-- Permission checks are enforced by the application layer. This migration
-- only creates the normalized role/permission assignment helpers.
CREATE OR REPLACE FUNCTION has_admin_permission(p_user_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_user_roles ur
    JOIN admin_role_permissions rp ON rp.role_id = ur.role_id
    JOIN admin_permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id
      AND p.code = p_permission
  );
$$;

COMMIT;
