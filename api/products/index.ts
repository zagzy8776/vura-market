import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT p.id, p.name, p.brand, p.description, p.price_kobo, p.condition_label, p.storage, p.color, p.stock_status, p.category_id, c.name AS category, ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN product_images pi ON pi.product_id = p.id WHERE p.is_active = true GROUP BY p.id, c.name ORDER BY p.created_at DESC`;
      return json(res, 200, { products: rows });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const { sellerId, categoryId, name, brand, description, priceKobo, conditionLabel, storage, color, images } = req.body || {};
    if (typeof sellerId !== 'string' || typeof name !== 'string' || typeof brand !== 'string' || !Number.isFinite(Number(priceKobo)) || !Array.isArray(images) || images.length < 1 || images.length > 6) return json(res, 400, { error: 'Please complete the listing details.' });
    const productRows = await sql`INSERT INTO products (seller_id, category_id, name, brand, description, price_kobo, condition_label, storage, color) VALUES (${sellerId}, ${categoryId || null}, ${name.trim()}, ${brand.trim()}, ${description || ''}, ${Math.round(Number(priceKobo))}, ${conditionLabel || 'New'}, ${storage || null}, ${color || null}) RETURNING id, name, brand, description, price_kobo, condition_label, storage, color`;
    const product = productRows[0];
    await sql`INSERT INTO product_images (product_id, image_url, sort_order) SELECT ${product.id}, image_value, ordinality - 1 FROM unnest(${images}::text[]) WITH ORDINALITY AS t(image_value, ordinality)`;
    return json(res, 201, { product: { ...product, images } });
  } catch {
    return json(res, 500, { error: 'We could not publish that listing.' });
  }
}
