-- Migration: 027_standardize_permission_codes.sql
-- Purpose: Standardize permission codes to match api/admin.ts requirements
-- Includes adding deliveries.manage permission that was defined but not used

BEGIN;

-- Verify all required permissions exist in admin_permissions table
-- This is idempotent - will not fail if already present
INSERT INTO admin_permissions(code, description) VALUES
  ('dashboard.read', 'View Dashboard'),
  ('products.read', 'View Products'),
  ('products.create', 'Create Products'),
  ('products.write', 'Update Products'),
  ('suppliers.read', 'View Suppliers'),
  ('suppliers.create', 'Create Suppliers'),
  ('suppliers.write', 'Update Suppliers'),
  ('categories.read', 'View Categories'),
  ('orders.read', 'View Orders'),
  ('orders.write', 'Update Orders'),
  ('customers.read', 'View Customers'),
  ('notifications.read', 'View Notifications'),
  ('deliveries.read', 'View Deliveries'),
  ('deliveries.manage', 'Manage Deliveries'),
  ('finance.read', 'View Finance'),
  ('refunds.create', 'Create Refunds')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

-- Ensure owner role has all permissions
INSERT INTO admin_role_permissions(role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM admin_roles r
JOIN admin_permissions p ON TRUE
WHERE r.name = 'owner'
ON CONFLICT DO NOTHING;

COMMIT;
