BEGIN;

-- Seed default admin permissions for all endpoints
-- This complements the RBAC foundation from migration 007

INSERT INTO admin_permissions(code, name, description) VALUES
  ('dashboard.read', 'View Dashboard', 'Read dashboard overview and analytics'),
  ('products.read', 'View Products', 'View product listings and details'),
  ('products.create', 'Create Products', 'Create new products'),
  ('products.write', 'Update Products', 'Modify existing products, prices, stock status'),
  ('suppliers.read', 'View Suppliers', 'View supplier information and scores'),
  ('suppliers.create', 'Create Suppliers', 'Create new suppliers'),
  ('suppliers.write', 'Update Suppliers', 'Modify supplier information and reliability scores'),
  ('categories.read', 'View Categories', 'View product categories'),
  ('orders.read', 'View Orders', 'View order details and lists'),
  ('orders.write', 'Update Orders', 'Modify order status, payment, sourcing, costs, and assignment'),
  ('customers.read', 'View Customers', 'View customer information and purchase history'),
  ('notifications.read', 'View Notifications', 'View notification audit log'),
  ('deliveries.read', 'View Deliveries', 'View fulfillment and delivery information'),
  ('deliveries.manage', 'Manage Deliveries', 'Create and update fulfillments, tracking, courier assignment'),
  ('finance.read', 'View Finance', 'View financial reports, revenue, costs, profit metrics'),
  ('refunds.create', 'Create Refunds', 'Create, approve, and complete refunds'),
  ('payouts.read', 'View Payouts', 'View supplier payout information'),
  ('payouts.manage', 'Manage Payouts', 'Create and settle supplier payouts')
ON CONFLICT (code) DO NOTHING;

-- Assign all permissions to owner role
INSERT INTO admin_role_permissions(role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM admin_roles r
JOIN admin_permissions p ON TRUE
WHERE r.name = 'owner'
ON CONFLICT DO NOTHING;

-- Create additional roles with specific permission sets if they don't exist

-- Manager role: operational but not financial
INSERT INTO admin_roles(name, description) VALUES
  ('manager', 'Operational manager - can manage orders, products, suppliers, deliveries')
ON CONFLICT (name) DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code IN (
  'dashboard.read',
  'products.read', 'products.create', 'products.write',
  'suppliers.read', 'suppliers.create', 'suppliers.write',
  'categories.read',
  'orders.read', 'orders.write',
  'customers.read',
  'notifications.read',
  'deliveries.read', 'deliveries.manage'
)
WHERE r.name = 'manager'
ON CONFLICT DO NOTHING;

-- Viewer role: read-only
INSERT INTO admin_roles(name, description) VALUES
  ('viewer', 'Viewer - read-only access to operations')
ON CONFLICT (name) DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code IN (
  'dashboard.read',
  'products.read',
  'suppliers.read',
  'categories.read',
  'orders.read',
  'customers.read',
  'notifications.read',
  'deliveries.read',
  'finance.read'
)
WHERE r.name = 'viewer'
ON CONFLICT DO NOTHING;

-- Finance role: financial operations
INSERT INTO admin_roles(name, description) VALUES
  ('finance', 'Finance analyst - can view and manage financial operations and refunds')
ON CONFLICT (name) DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code IN (
  'dashboard.read',
  'orders.read',
  'customers.read',
  'finance.read',
  'refunds.create',
  'payouts.read', 'payouts.manage'
)
WHERE r.name = 'finance'
ON CONFLICT DO NOTHING;

COMMIT;
