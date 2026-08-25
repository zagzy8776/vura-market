BEGIN;

-- Permission checks are enforced by the application layer.
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

-- Existing admin accounts retain access by being explicitly assigned the owner role.
INSERT INTO admin_user_roles(user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN admin_roles r ON r.name = 'owner'
WHERE u.role = 'admin'
ON CONFLICT DO NOTHING;

COMMIT;
