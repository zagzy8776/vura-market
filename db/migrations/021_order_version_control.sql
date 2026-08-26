BEGIN;

-- Add version control columns for optimistic locking on orders and fulfillments
-- This prevents concurrent updates from silently overwriting each other

-- Add version column to orders table
-- Version starts at 1 and increments with each update
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Add indexes for optimistic locking queries
-- Queries will use: WHERE id = $1 AND version = $2
CREATE INDEX IF NOT EXISTS idx_orders_version 
  ON orders(id, version);

-- Add version column to order_fulfillments table  
-- Fulfillments can also be updated concurrently (by webhooks and admins)
ALTER TABLE order_fulfillments
ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Add indexes for fulfillment version queries
CREATE INDEX IF NOT EXISTS idx_order_fulfillments_version
  ON order_fulfillments(id, version);

-- Update existing rows to ensure version is set (should already be 1 from DEFAULT)
UPDATE orders SET version = 1 WHERE version IS NULL;
UPDATE order_fulfillments SET version = 1 WHERE version IS NULL;

-- Add NOT NULL constraint if it wasn't already
ALTER TABLE orders 
ALTER COLUMN version SET NOT NULL;

ALTER TABLE order_fulfillments
ALTER COLUMN version SET NOT NULL;

COMMIT;
