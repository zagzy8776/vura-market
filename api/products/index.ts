import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 180);
}

const PRODUCT_SELECT = `p.id, p.slug, p.name, p.brand, p.description, p.price_kobo, p.condition_label, p.storage, p.color, p.stock_status, p.category_id, c.name AS category, ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const slug = typeof req.query?.slug === 'string' ? req.query.slug.trim() : '';
      const id = typeof req.query?.id === 'string' ? req.query.id.trim() : '';

      // Detail by slug (ignore literal "undefined" from broken links)
      if (slug && slug !== 'undefined') {
        const rows = await sql`
          SELECT p.id, p.slug, p.name, p.brand, p.description, p.price_kobo, p.condition_label,
                 p.storage, p.color, p.stock_status, p.category_id, c.name AS category,
                 ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN product_images pi ON pi.product_id = p.id
          WHERE p.is_active = true AND p.slug = ${slug}
          GROUP BY p.id, c.name
          LIMIT 1`;
        const product = rows[0];
        if (!product) return json(res, 404, { error: 'Product not found.' });
        return json(res, 200, { product, variants: product.variants || [] });
      }

      // Detail by id (UUID) — fallback when slug is missing
      if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        const rows = await sql`
          SELECT p.id, p.slug, p.name, p.brand, p.description, p.price_kobo, p.condition_label,
                 p.storage, p.color, p.stock_status, p.category_id, c.name AS category,
                 ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN product_images pi ON pi.product_id = p.id
          WHERE p.is_active = true AND p.id = ${id}::uuid
          GROUP BY p.id, c.name
          LIMIT 1`;
        const product = rows[0];
        if (!product) return json(res, 404, { error: 'Product not found.' });
        return json(res, 200, { product, variants: [] });
      }

      const rows = await sql`
        SELECT p.id, p.slug, p.name, p.brand, p.description, p.price_kobo, p.condition_label,
               p.storage, p.color, p.stock_status, p.category_id, c.name AS category,
               ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN product_images pi ON pi.product_id = p.id
        WHERE p.is_active = true
        GROUP BY p.id, c.name
        ORDER BY p.created_at DESC
        LIMIT 200`;
      return json(res, 200, { products: rows });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const {
      categoryId, name, brand, description, priceKobo, conditionLabel, storage, color, images,
      supplierId, sourcePriceKobo, sourceLocation,
    } = req.body || {};
    if (
      typeof name !== 'string' || name.trim().length < 2 || typeof brand !== 'string' ||
      !Number.isFinite(Number(priceKobo)) || Number(priceKobo) <= 0 ||
      !Array.isArray(images) || images.length < 1 || images.length > 6
    ) {
      return json(res, 400, { error: 'Please complete the listing details.' });
    }
    const retail = Math.round(Number(priceKobo));
    const source = sourcePriceKobo == null || sourcePriceKobo === '' ? null : Math.round(Number(sourcePriceKobo));
    if (source !== null && (!Number.isFinite(source) || source <= 0)) {
      return json(res, 400, { error: 'Source price is invalid.' });
    }

    const baseSlug = slugify(name) || `product-${Date.now()}`;
    let slug = baseSlug;
    for (let i = 0; i < 8; i++) {
      const existing = await sql`SELECT id FROM products WHERE slug = ${slug} LIMIT 1`;
      if (!existing.length) break;
      slug = `${baseSlug}-${i + 2}`;
    }

    const productRows = await sql`
      INSERT INTO products (
        seller_id, category_id, name, slug, brand, description, price_kobo, condition_label,
        storage, color, supplier_id, source_price_kobo, source_location, expected_cost_kobo, verified_at
      ) VALUES (
        ${admin.id}, ${categoryId || null}, ${name.trim()}, ${slug}, ${brand.trim()},
        ${String(description || '').trim()}, ${retail}, ${conditionLabel || 'New'},
        ${storage || null}, ${color || null}, ${supplierId || null}, ${source},
        ${sourceLocation || null}, ${source}, now()
      )
      RETURNING id, slug, name, brand, description, price_kobo, condition_label, storage, color, stock_status, category_id`;
    const product = productRows[0];
    await sql`
      INSERT INTO product_images (product_id, image_url, sort_order)
      SELECT ${product.id}, image_value, ordinality - 1
      FROM unnest(${images}::text[]) WITH ORDINALITY AS t(image_value, ordinality)`;
    return json(res, 201, { product: { ...product, images } });
  } catch {
    return json(res, 500, { error: 'We could not publish that listing.' });
  }
}
