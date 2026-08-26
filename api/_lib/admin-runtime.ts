import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './db.js';
import { requireAdmin, requireAdminPermission } from './auth.js';
import { recordAudit } from './audit.js';
import { applySecurityHeaders } from './http.js';
import { randomUUID } from 'crypto';

const stockStatuses = new Set(['available', 'low_stock', 'out_of_stock', 'unavailable']);

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function resource(req: VercelRequest) {
  const value = req.query.resource;
  return Array.isArray(value) ? value[0] : value || '';
}

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function imageUrls(input: unknown) {
  if (!Array.isArray(input)) return [] as string[];
  return input.filter((u): u is string => typeof u === 'string' && /^https:\/\//.test(String(u))).slice(0, 8);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res);
  const r = resource(req);
  if (r === 'health' && req.method === 'GET') {
    const requestId = randomUUID();
    try {
      const started = Date.now();
      const dbTest = await sql`SELECT 1`;
      res.setHeader('X-Request-ID', requestId);
      return json(res, 200, { status: 'healthy', database: { connected: !!dbTest.length, responseTimeMs: Date.now() - started }, timestamp: new Date().toISOString(), requestId });
    } catch {
      res.setHeader('X-Request-ID', requestId);
      return json(res, 500, { status: 'down', error: 'Health check failed', timestamp: new Date().toISOString(), requestId });
    }
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const method = (req.method || 'GET') as Method;

  try {
    if (r === 'categories') return categories(req, res, method, admin.id);
    if (r === 'products') return products(req, res, method, admin.id);
    if (r === 'suppliers' && method === 'GET') {
      const ok = await requireAdminPermission(req, res, 'suppliers.read');
      if (!ok) return;
      return json(res, 200, { suppliers: await sql`SELECT id,name,location,phone,notes,reliability_score,created_at,updated_at FROM suppliers ORDER BY updated_at DESC` });
    }
    if (r === 'overview' && method === 'GET') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
      const [live] = await sql`SELECT COUNT(*)::int AS count FROM products WHERE is_active = true`;
      const [monthStats] = await sql`
        SELECT
          COUNT(*)::int AS orders,
          COALESCE(SUM(total_kobo), 0)::bigint AS revenue,
          COALESCE(SUM(actual_profit_kobo), 0)::bigint AS profit
        FROM orders
        WHERE created_at >= date_trunc('month', now())
          AND COALESCE(status, '') <> 'cancelled'
      `;
      const [pendingPayment] = await sql`
        SELECT COUNT(*)::int AS count FROM orders
        WHERE payment_status IN ('unpaid', 'pending_verification')
          AND COALESCE(status, '') <> 'cancelled'
      `;
      const [toFulfill] = await sql`
        SELECT COUNT(*)::int AS count FROM orders
        WHERE payment_status = 'paid'
          AND COALESCE(status, '') NOT IN ('delivered', 'cancelled')
      `;
      const [lowStock] = await sql`
        SELECT COUNT(*)::int AS count FROM products
        WHERE is_active = true AND stock_status IN ('low_stock', 'out_of_stock')
      `;
      const recentOrders = await sql`
        SELECT o.id, o.order_number, o.total_kobo, o.status, o.payment_status, o.created_at,
               o.delivery_name, p.name AS product_name
        FROM orders o
        JOIN products p ON p.id = o.product_id
        ORDER BY o.created_at DESC
        LIMIT 8
      `;
      return json(res, 200, {
        liveProducts: live?.count || 0,
        monthlyOrders: monthStats?.orders || 0,
        monthlyRevenueKobo: Number(monthStats?.revenue || 0),
        monthlyProfitKobo: Number(monthStats?.profit || 0),
        attention: {
          pendingPayment: pendingPayment?.count || 0,
          toFulfill: toFulfill?.count || 0,
          lowStock: lowStock?.count || 0,
        },
        recentOrders,
        customers: [],
        notifications: [],
        audit: [],
        orderEvents: [],
      });
    }
    if (r === 'orders' && method === 'GET') {
      const ok = await requireAdminPermission(req, res, 'orders.read');
      if (!ok) return;
      const rows = await sql`SELECT o.id,o.order_number,o.quantity,o.total_kobo,o.status,o.payment_status,o.transfer_reference,o.payment_submitted_at,o.payment_verified_at,o.sourcing_status,o.delivery_name,o.delivery_phone,o.delivery_address,o.delivery_city,o.purchase_cost_kobo,o.delivery_fee_kobo,o.other_cost_kobo,o.actual_profit_kobo,o.created_at,p.name AS product_name,p.brand,s.name AS supplier_name,u.email AS buyer_email FROM orders o JOIN products p ON p.id=o.product_id LEFT JOIN suppliers s ON s.id=o.supplier_id JOIN users u ON u.id=o.buyer_id ORDER BY o.created_at DESC LIMIT 200`;
      return json(res, 200, { orders: rows });
    }
    if (r === 'notifications' && method === 'GET') {
      const ok = await requireAdminPermission(req, res, 'notifications.read');
      if (!ok) return;
      const rows = await sql`SELECT n.id,n.user_id,n.order_id,n.type,n.title,n.body,n.created_at,u.email AS user_email,o.order_number FROM notifications n LEFT JOIN users u ON u.id=n.user_id LEFT JOIN orders o ON o.id=n.order_id ORDER BY n.created_at DESC LIMIT 200`;
      return json(res, 200, { notifications: rows });
    }
    return json(res, 404, { error: 'Admin resource not found.' });
  } catch {
    return json(res, 500, { error: 'The admin operation could not be completed.' });
  }
}

async function categories(req: VercelRequest, res: VercelResponse, method: Method, adminId: string) {
  const permission = method === 'GET' ? 'categories.read' : 'categories.create';
  const admin = await requireAdminPermission(req, res, permission);
  if (!admin) return;
  if (method === 'GET') {
    const rows = await sql`SELECT id,name,slug,icon FROM categories ORDER BY name ASC`;
    return json(res, 200, { categories: rows });
  }
  if (method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const icon = typeof req.body?.icon === 'string' && req.body.icon.trim() ? req.body.icon.trim() : 'Package';
  if (name.length < 2) return json(res, 400, { error: 'Category name is required.' });
  const base = slugify(name) || `category-${Date.now()}`;
  let slug = base;
  for (let i = 2; i < 30; i++) {
    const existing = await sql`SELECT id FROM categories WHERE slug=${slug} LIMIT 1`;
    if (!existing[0]) break;
    slug = `${base}-${i}`;
  }
  try {
    const rows = await sql`INSERT INTO categories(name,slug,icon) VALUES(${name},${slug},${icon}) RETURNING id,name,slug,icon`;
    await recordAudit({ actorUserId: admin.id, action: 'category.create', entityType: 'category', entityId: rows[0].id, afterData: rows[0] });
    return json(res, 201, { category: rows[0] });
  } catch {
    return json(res, 409, { error: 'A category with that name already exists.' });
  }
}

async function products(req: VercelRequest, res: VercelResponse, method: Method, adminId: string) {
  const permission = method === 'GET' ? 'products.read' : (method === 'POST' ? 'products.create' : 'products.write');
  const admin = await requireAdminPermission(req, res, permission);
  if (!admin) return;
  if (method === 'GET') {
    const rows = await sql`SELECT p.id,p.name,p.brand,p.description,p.price_kobo,p.condition_label,p.storage,p.color,p.stock_status,p.is_active,p.source_price_kobo,p.source_location,p.expected_cost_kobo,p.verified_at,p.category_id,p.supplier_id,s.name AS supplier_name,c.name AS category,ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN product_images pi ON pi.product_id=p.id GROUP BY p.id,s.name,c.name ORDER BY p.created_at DESC LIMIT 500`;
    return json(res, 200, { products: rows });
  }
  const body = req.body || {};
  if (method === 'POST') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const brand = typeof body.brand === 'string' ? body.brand.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const price = Number(body.priceKobo);
    const sourcePrice = body.sourcePriceKobo == null || body.sourcePriceKobo === '' ? null : Number(body.sourcePriceKobo);
    const condition = typeof body.conditionLabel === 'string' && body.conditionLabel.trim() ? body.conditionLabel.trim() : 'New';
    const stock = typeof body.stockStatus === 'string' ? body.stockStatus : 'available';
    const urls = imageUrls(body.images);
    if (name.length < 2 || brand.length < 1) return json(res, 400, { error: 'Product name and brand are required.' });
    if (!Number.isFinite(price) || price <= 0) return json(res, 400, { error: 'Product price must be greater than zero.' });
    if (!stockStatuses.has(stock)) return json(res, 400, { error: 'Invalid stock status.' });
    if (urls.length < 1) return json(res, 400, { error: 'Add at least one product photo.' });
    const rows = await sql`INSERT INTO products(seller_id,category_id,supplier_id,name,brand,description,price_kobo,condition_label,storage,color,stock_status,source_price_kobo,source_location,expected_cost_kobo,is_active,verified_at) VALUES(${adminId},${body.categoryId||null},${body.supplierId||null},${name},${brand},${description},${Math.round(price)},${condition},${body.storage||null},${body.color||null},${stock},${sourcePrice===null?null:Math.round(sourcePrice)},${body.sourceLocation||null},${sourcePrice===null?null:Math.round(sourcePrice)},true,now()) RETURNING id`;
    await sql`INSERT INTO product_images (product_id, image_url, sort_order) SELECT ${rows[0].id}, image_value, ordinality - 1 FROM unnest(${urls}::text[]) WITH ORDINALITY AS t(image_value, ordinality)`;
    await recordAudit({ actorUserId: adminId, action: 'product.create', entityType: 'product', entityId: rows[0].id });
    return json(res, 201, { product: { id: rows[0].id, images: urls } });
  }
  if (method === 'DELETE') {
    const productId = body.productId;
    if (typeof productId !== 'string') return json(res, 400, { error: 'Product is required.' });
    const before = await sql`SELECT id, name, is_active FROM products WHERE id=${productId} LIMIT 1`;
    if (!before[0]) return json(res, 404, { error: 'Product not found.' });
    try {
      await sql`DELETE FROM product_images WHERE product_id=${productId}`;
      await sql`DELETE FROM products WHERE id=${productId}`;
      await recordAudit({ actorUserId: adminId, action: 'product.delete', entityType: 'product', entityId: productId, beforeData: before[0] });
      return json(res, 200, { deleted: true, productId });
    } catch {
      await sql`UPDATE products SET is_active=false, stock_status='unavailable', updated_at=now() WHERE id=${productId}`;
      await recordAudit({ actorUserId: adminId, action: 'product.deactivate', entityType: 'product', entityId: productId, beforeData: before[0] });
      return json(res, 200, { deleted: false, deactivated: true, productId, message: 'Product has related orders so it was deactivated instead of fully removed.' });
    }
  }
  if (method !== 'PATCH') return json(res, 405, { error: 'Method not allowed' });
  const productId = body.productId;
  if (typeof productId !== 'string') return json(res, 400, { error: 'Product is required.' });
  const before = await sql`SELECT id FROM products WHERE id=${productId} LIMIT 1`;
  if (!before[0]) return json(res, 404, { error: 'Product not found.' });
  const numericPrice = body.priceKobo == null || body.priceKobo === '' ? null : Number(body.priceKobo);
  const numericSource = body.sourcePriceKobo == null || body.sourcePriceKobo === '' ? null : Number(body.sourcePriceKobo);
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  const brand = typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim() : null;
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const condition = typeof body.conditionLabel === 'string' && body.conditionLabel.trim() ? body.conditionLabel.trim() : null;
  const stockStatus = typeof body.stockStatus === 'string' ? body.stockStatus : null;
  await sql`UPDATE products SET name=COALESCE(${name},name), brand=COALESCE(${brand},brand), description=COALESCE(${description},description), condition_label=COALESCE(${condition},condition_label), storage=COALESCE(${body.storage||null},storage), color=COALESCE(${body.color||null},color), category_id=COALESCE(${body.categoryId||null},category_id), supplier_id=COALESCE(${body.supplierId||null},supplier_id), source_location=COALESCE(${body.sourceLocation||null},source_location), stock_status=COALESCE(${stockStatus},stock_status), is_active=COALESCE(${typeof body.isActive==='boolean'?body.isActive:null},is_active), price_kobo=COALESCE(${numericPrice===null?null:Math.round(numericPrice)},price_kobo), source_price_kobo=COALESCE(${numericSource===null?null:Math.round(numericSource)},source_price_kobo), expected_cost_kobo=COALESCE(${numericSource===null?null:Math.round(numericSource)},expected_cost_kobo), verified_at=now(), updated_at=now() WHERE id=${productId}`;
  if (Array.isArray(body.images)) {
    const urls = imageUrls(body.images);
    await sql`DELETE FROM product_images WHERE product_id=${productId}`;
    if (urls.length) await sql`INSERT INTO product_images (product_id, image_url, sort_order) SELECT ${productId}, image_value, ordinality - 1 FROM unnest(${urls}::text[]) WITH ORDINALITY AS t(image_value, ordinality)`;
  }
  await recordAudit({ actorUserId: adminId, action: 'product.update', entityType: 'product', entityId: productId });
  return json(res, 200, { product: { id: productId } });
}
