import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT p.id, p.slug, p.name, p.brand, p.price_kobo, p.compare_at_price_kobo, p.stock_status,
               w.created_at AS saved_at, c.name AS category_name, c.slug AS category_slug,
               ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images
          FROM wishlist_items w
          JOIN products p ON p.id = w.product_id AND p.is_active = true
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN product_images pi ON pi.product_id = p.id
         WHERE w.user_id = ${user.id}
         GROUP BY p.id, c.name, c.slug, w.created_at
         ORDER BY w.created_at DESC
         LIMIT 100`;
      return json(res, 200, { items: rows });
    }

    let productId: string | null = null;
    if (req.method === 'POST') {
      productId = typeof req.body?.productId === 'string' ? req.body.productId : null;
    } else if (req.method === 'DELETE') {
      const raw = req.query.productId;
      productId = (Array.isArray(raw) ? raw[0] : raw) || null;
    } else {
      return json(res, 405, { error: 'Method not allowed.' });
    }

    if (!productId || !UUID_RE.test(productId)) return json(res, 400, { error: 'Product is required.' });

    const exists = await sql`SELECT 1 FROM products WHERE id = ${productId} AND is_active = true LIMIT 1`;
    if (!exists[0]) return json(res, 404, { error: 'Product not found.' });

    if (req.method === 'POST') {
      await sql`INSERT INTO wishlist_items (user_id, product_id) VALUES (${user.id}, ${productId}) ON CONFLICT (user_id, product_id) DO NOTHING`;
      return json(res, 200, { ok: true });
    }
    await sql`DELETE FROM wishlist_items WHERE user_id = ${user.id} AND product_id = ${productId}`;
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 500, { error: 'Your wishlist is temporarily unavailable.' });
  }
}
