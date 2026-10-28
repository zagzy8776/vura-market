import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './db.js';
import { requireUser, requireAdminPermission } from './auth.js';
import { recordAudit } from './audit.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONDITIONS = new Set(['New', 'Like new', 'Used - good', 'Used - fair']);
const PHONE = /^\+?[0-9]{10,15}$/;
type Data = Record<string, unknown>;

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max + 1) : '';
}

export function validateListing(body: Data): string | null {
  if (str(body.title, 150).length < 3 || str(body.title, 150).length > 150) return 'Enter a title between 3 and 150 characters.';
  if (str(body.description, 3000).length > 3000) return 'Description must be under 3000 characters.';
  if (!Number.isSafeInteger(body.priceKobo) || (body.priceKobo as number) < 10000 || (body.priceKobo as number) > 100000000000) return 'Enter a valid price in naira.';
  if (!Number.isInteger(body.quantity) || (body.quantity as number) < 1 || (body.quantity as number) > 100000) return 'Enter a valid available quantity.';
  if (!CONDITIONS.has(body.condition)) return 'Choose a product condition.';
  if (!UUID.test(str(body.categoryId, 80))) return 'Choose a category.';
  if (str(body.shopName, 100).length < 2 || str(body.shopName, 100).length > 100) return 'Enter your shop name.';
  if (!PHONE.test(str(body.whatsapp, 20))) return 'Enter your WhatsApp number with country code, e.g. 2348012345678.';
  if (!/^[A-Za-z]{2}$/.test(str(body.stateCode, 2))) return 'Choose your state.';
  if (str(body.city, 100).length < 2 || str(body.city, 100).length > 100) return 'Enter your city or area.';
  if (str(body.campus, 120).length > 120) return 'Campus name is too long.';
  if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 8) return 'Upload 1 to 8 product photos.';
  // Listing images come from our configured Cloudinary unsigned upload preset.
  if (!body.images.every((x) => typeof x === 'string' && /^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\//.test(x) && x.length < 500)) return 'Upload valid product photos.';
  return null;
}

function listingFields(body: Data) {
  return {
    title: str(body.title, 150),
    description: str(body.description, 3000),
    priceKobo: Number(body.priceKobo),
    quantity: Number(body.quantity),
    condition: str(body.condition, 32),
    categoryId: str(body.categoryId, 80),
    images: body.images as string[],
    shopName: str(body.shopName, 100),
    whatsapp: str(body.whatsapp, 20),
    stateCode: str(body.stateCode, 2).toUpperCase(),
    city: str(body.city, 100),
    campus: str(body.campus, 120) || null,
  };
}

async function saveShop(userId: string, f: ReturnType<typeof listingFields>) {
  const state = await sql`SELECT code FROM nigeria_states WHERE code = ${f.stateCode} LIMIT 1`;
  if (!state.length) throw new Error('Invalid state. Choose a Nigerian state.');
  await sql`
    INSERT INTO marketplace_sellers(user_id, shop_name, whatsapp, state_code, city, campus)
    VALUES (${userId}, ${f.shopName}, ${f.whatsapp}, ${f.stateCode}, ${f.city}, ${f.campus})
    ON CONFLICT(user_id) DO UPDATE SET shop_name=EXCLUDED.shop_name, whatsapp=EXCLUDED.whatsapp,
      state_code=EXCLUDED.state_code, city=EXCLUDED.city, campus=EXCLUDED.campus, updated_at=now()
  `;
}

export async function handleSeller(req: VercelRequest, res: VercelResponse, body: Data = {}) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      const page = Math.min(100000, Math.max(1, Number(req.query.page) || 1));
      const targetId = str(req.query.id, 80);
      if (targetId && !UUID.test(targetId)) return json(res, 400, { error: 'Invalid listing.' });
      const [counts, profile, listings] = await Promise.all([
        sql`SELECT count(*)::int AS total FROM marketplace_listings WHERE seller_id=${user.id} AND status <> 'removed'`,
        sql`SELECT shop_name, whatsapp, state_code, city, campus FROM marketplace_sellers WHERE user_id=${user.id}`,
        sql`SELECT id, title, description, price_kobo, condition_label, quantity, images, status, category_id, created_at, updated_at
               FROM marketplace_listings WHERE seller_id=${user.id} AND status <> 'removed'
               AND (${targetId || null}::uuid IS NULL OR id=${targetId || null}::uuid)
               ORDER BY created_at DESC LIMIT 24 OFFSET ${targetId ? 0 : (page - 1) * 24}`,
      ]);
      return json(res, 200, { profile: profile[0] || null, listings, total: counts[0]?.total || 0, page });
    }
    if (req.method === 'POST') {
      const error = validateListing(body);
      if (error) return json(res, 400, { error });
      const f = listingFields(body);
      const recent = await sql`SELECT count(*)::int AS count FROM marketplace_listings WHERE seller_id=${user.id} AND created_at > now() - interval '1 day'`;
      if (Number(recent[0]?.count || 0) >= 40) return json(res, 429, { error: 'Daily posting limit reached. Please post again tomorrow.' });
      await saveShop(user.id, f);
      const rows = await sql`
        INSERT INTO marketplace_listings (seller_id, category_id, title, description, price_kobo, condition_label, quantity, images)
        VALUES (${user.id}, ${f.categoryId}::uuid, ${f.title}, ${f.description}, ${f.priceKobo}, ${f.condition}, ${f.quantity}, ${f.images})
        RETURNING id, title, status, created_at
      `;
      return json(res, 201, { listing: rows[0], message: 'Listing sent for review. You can keep posting more products.' });
    }
    if (req.method === 'PATCH' || req.method === 'DELETE') {
      const id = str(body.id, 80);
      if (!UUID.test(id)) return json(res, 400, { error: 'Invalid listing.' });
      const existing = await sql`SELECT id, status FROM marketplace_listings WHERE id=${id}::uuid AND seller_id=${user.id} AND status <> 'removed' LIMIT 1`;
      if (!existing.length) return json(res, 404, { error: 'Listing not found.' });
      if (req.method === 'DELETE') {
        await sql`UPDATE marketplace_listings SET status='removed', updated_at=now() WHERE id=${id}::uuid AND seller_id=${user.id}`;
        return json(res, 200, { ok: true });
      }
      const action = str(body.action, 20);
      if (action === 'pause') {
        await sql`UPDATE marketplace_listings SET status='paused', updated_at=now() WHERE id=${id}::uuid AND seller_id=${user.id}`;
        return json(res, 200, { ok: true });
      }
      if (action === 'resume') {
        await sql`UPDATE marketplace_listings SET status='pending', reviewed_at=null, reviewed_by=null, updated_at=now() WHERE id=${id}::uuid AND seller_id=${user.id}`;
        return json(res, 200, { ok: true });
      }
      if (action === 'edit') {
        const error = validateListing(body);
        if (error) return json(res, 400, { error });
        const f = listingFields(body);
        await saveShop(user.id, f);
        await sql`
          UPDATE marketplace_listings SET category_id=${f.categoryId}::uuid, title=${f.title}, description=${f.description},
            price_kobo=${f.priceKobo}, quantity=${f.quantity}, condition_label=${f.condition},
            images=${f.images}, status='pending', reviewed_at=null, reviewed_by=null, updated_at=now()
          WHERE id=${id}::uuid AND seller_id=${user.id}
        `;
        return json(res, 200, { ok: true, message: 'Updated listing sent for review.' });
      }
      return json(res, 400, { error: 'Invalid action.' });
    }
    return json(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid state')) return json(res, 400, { error: err.message });
    return json(res, 500, { error: 'Unable to save your listing. Please try again.' });
  }
}

export async function handleMarketplace(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const id = str(req.query.id, 80);
    const sellerId = str(req.query.sellerId, 80);
    const q = str(req.query.q, 100);
    const state = str(req.query.state, 2).toUpperCase();
    if (id && !UUID.test(id)) return json(res, 400, { error: 'Invalid listing.' });
    if (sellerId && !UUID.test(sellerId)) return json(res, 400, { error: 'Invalid seller.' });
    const rows = await sql`
      SELECT l.id, l.seller_id, l.title, l.description, l.price_kobo, l.condition_label,
             l.quantity, l.images, l.created_at, s.shop_name, s.state_code, s.city, s.campus,
             s.whatsapp, c.name AS category_name
      FROM marketplace_listings l
      JOIN marketplace_sellers s ON s.user_id=l.seller_id
      LEFT JOIN categories c ON c.id=l.category_id
      WHERE l.status='approved' AND l.quantity > 0
        AND (${id || null}::uuid IS NULL OR l.id=${id || null}::uuid)
        AND (${sellerId || null}::uuid IS NULL OR l.seller_id=${sellerId || null}::uuid)
        AND (${state || null}::text IS NULL OR s.state_code=${state || null})
        AND (${q || null}::text IS NULL OR (l.title ILIKE ${'%' + q + '%'} OR l.description ILIKE ${'%' + q + '%'}))
      ORDER BY l.created_at DESC LIMIT ${id ? 1 : 48}
    `;
    if (id && !rows.length) return json(res, 404, { error: 'Listing not available.' });
    return json(res, 200, { listings: rows });
  } catch {
    return json(res, 500, { error: 'Marketplace listings are temporarily unavailable.' });
  }
}

export async function handleMarketplaceModeration(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdminPermission(req, res, req.method === 'GET' ? 'products.read' : 'products.write');
  if (!admin) return;
  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT l.id, l.seller_id, l.title, l.description, l.price_kobo, l.quantity,
          l.condition_label, l.images, l.status, l.created_at, s.shop_name, s.city,
          s.state_code, s.whatsapp, u.email AS seller_email, c.name AS category_name
        FROM marketplace_listings l JOIN marketplace_sellers s ON s.user_id=l.seller_id
        JOIN users u ON u.id=l.seller_id LEFT JOIN categories c ON c.id=l.category_id
        WHERE l.status IN ('pending', 'approved', 'rejected')
        ORDER BY CASE WHEN l.status='pending' THEN 0 ELSE 1 END, l.created_at DESC LIMIT 200
      `;
      return json(res, 200, { listings: rows });
    }
    if (req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed.' });
    const body = (req.body || {}) as Data;
    const id = str(body.id, 80), status = str(body.status, 20);
    if (!UUID.test(id) || !['approved', 'rejected'].includes(status)) return json(res, 400, { error: 'Invalid review request.' });
    const updated = await sql`
      UPDATE marketplace_listings SET status=${status}, reviewed_by=${admin.id}, reviewed_at=now(), updated_at=now()
      WHERE id=${id}::uuid AND status IN ('pending', 'approved', 'rejected')
      RETURNING id, seller_id, status
    `;
    if (!updated.length) return json(res, 404, { error: 'Listing not found.' });
    await recordAudit({ actorUserId: admin.id, action: 'marketplace.review', entityType: 'marketplace_listing', entityId: id, afterData: { status } });
    return json(res, 200, { listing: updated[0] });
  } catch {
    return json(res, 500, { error: 'Unable to process listing review.' });
  }
}
