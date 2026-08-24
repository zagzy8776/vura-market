import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!await requireAdmin(req, res)) return;
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT p.id, p.name, p.brand, p.price_kobo, p.condition_label, p.storage, p.color, p.stock_status, p.is_active, p.source_price_kobo, p.source_location, p.expected_cost_kobo, p.verified_at, s.name AS supplier_name, c.name AS category, ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN product_images pi ON pi.product_id = p.id GROUP BY p.id, s.name, c.name ORDER BY p.created_at DESC LIMIT 500`;
      return json(res, 200, { products: rows });
    }
    if (req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed' });
    const { productId, stockStatus, isActive, priceKobo, sourcePriceKobo, supplierId, sourceLocation } = req.body || {};
    if (typeof productId !== 'string') return json(res, 400, { error: 'Product is required.' });
    const rows = await sql`UPDATE products SET stock_status = COALESCE(${typeof stockStatus === 'string' ? stockStatus : null}, stock_status), is_active = COALESCE(${typeof isActive === 'boolean' ? isActive : null}, is_active), price_kobo = COALESCE(${Number.isFinite(Number(priceKobo)) ? Math.round(Number(priceKobo)) : null}, price_kobo), source_price_kobo = COALESCE(${Number.isFinite(Number(sourcePriceKobo)) ? Math.round(Number(sourcePriceKobo)) : null}, source_price_kobo), expected_cost_kobo = COALESCE(${Number.isFinite(Number(sourcePriceKobo)) ? Math.round(Number(sourcePriceKobo)) : null}, expected_cost_kobo), supplier_id = COALESCE(${supplierId || null}, supplier_id), source_location = COALESCE(${sourceLocation || null}, source_location), verified_at = now(), updated_at = now() WHERE id = ${productId} RETURNING id, name, price_kobo, source_price_kobo, stock_status, is_active`;
    if (!rows[0]) return json(res, 404, { error: 'Product not found.' });
    return json(res, 200, { product: rows[0] });
  } catch { return json(res, 500, { error: 'We could not update the product.' }); }
}
