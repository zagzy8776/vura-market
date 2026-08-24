/*
# Default marketplace product ownership

1. Purpose
- Makes the signed-in seller the database owner of every new product by default.

2. Security
- Product creation no longer depends on the browser supplying an ownership value.
- Existing product rows are unchanged.
*/

ALTER TABLE public.products ALTER COLUMN owner_id SET DEFAULT auth.uid();
