import { sql } from '../../db.js';
import type { AgentTool } from '../types.js';

function asString(input: unknown, key: string, fallback = ''): string {
  if (!input || typeof input !== 'object') return fallback;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : fallback;
}

function asNumber(input: unknown, key: string, fallback: number): number {
  if (!input || typeof input !== 'object') return fallback;
  const value = (input as Record<string, unknown>)[key];
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Search active catalog products (category-agnostic). */
export const productsSearchTool: AgentTool = {
  name: 'products.search',
  description: 'Search Vura catalog products by name, brand, or free text. Returns structured product rows only — no invented data.',
  risk: 'read',
  async execute(input) {
    const q = asString(input, 'q') || asString(input, 'query');
    const limit = Math.min(Math.max(asNumber(input, 'limit', 20), 1), 50);
    if (!q) {
      const rows = await sql`
        SELECT p.id, p.slug, p.name, p.brand, p.price_kobo, p.stock_status, p.condition_label, p.storage, p.color,
               c.name AS category, c.slug AS category_slug
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true
        ORDER BY p.created_at DESC
        LIMIT ${limit}`;
      return { products: rows, query: null, source: 'vura.products' };
    }
    const pattern = `%${q.slice(0, 80)}%`;
    const rows = await sql`
      SELECT p.id, p.slug, p.name, p.brand, p.price_kobo, p.stock_status, p.condition_label, p.storage, p.color,
             c.name AS category, c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = true
        AND (p.name ILIKE ${pattern} OR p.brand ILIKE ${pattern} OR COALESCE(p.description, '') ILIKE ${pattern})
      ORDER BY p.created_at DESC
      LIMIT ${limit}`;
    return { products: rows, query: q, source: 'vura.products' };
  },
};

/** Inspect one product by id or slug, including images. */
export const productInspectTool: AgentTool = {
  name: 'product.inspect',
  description: 'Load a single Vura product by id or slug with images and category. Returns UNKNOWN fields as null — never invents specs.',
  risk: 'read',
  async execute(input) {
    const id = asString(input, 'id');
    const slug = asString(input, 'slug');
    if (!id && !slug) throw new Error('product.inspect requires id or slug');
    const rows = id
      ? await sql`
          SELECT p.id, p.slug, p.name, p.brand, p.description, p.price_kobo, p.stock_status, p.condition_label,
                 p.storage, p.color, p.is_active, c.name AS category, c.slug AS category_slug,
                 ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN product_images pi ON pi.product_id = p.id
          WHERE p.id = ${id}::uuid
          GROUP BY p.id, c.name, c.slug
          LIMIT 1`
      : await sql`
          SELECT p.id, p.slug, p.name, p.brand, p.description, p.price_kobo, p.stock_status, p.condition_label,
                 p.storage, p.color, p.is_active, c.name AS category, c.slug AS category_slug,
                 ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN product_images pi ON pi.product_id = p.id
          WHERE p.slug = ${slug}
          GROUP BY p.id, c.name, c.slug
          LIMIT 1`;
    if (!rows[0]) return { product: null, evidence: 'UNKNOWN', source: 'vura.products' };
    return { product: rows[0], evidence: 'SOURCE_CONFIRMED', source: 'vura.products' };
  },
};

/** Inventory snapshot by stock_status (and optional category). */
export const inventoryReadTool: AgentTool = {
  name: 'inventory.read',
  description: 'Read inventory snapshot: counts by stock_status and low-stock product list from Vura DB only.',
  risk: 'read',
  async execute(input) {
    const limit = Math.min(Math.max(asNumber(input, 'limit', 30), 1), 100);
    const byStatus = await sql`
      SELECT COALESCE(stock_status, 'unknown') AS stock_status, COUNT(*)::int AS count
      FROM products WHERE is_active = true
      GROUP BY 1 ORDER BY count DESC`;
    const low = await sql`
      SELECT id, slug, name, brand, stock_status, price_kobo
      FROM products
      WHERE is_active = true AND stock_status IN ('low_stock', 'out_of_stock', 'unavailable')
      ORDER BY updated_at DESC NULLS LAST
      LIMIT ${limit}`;
    return { byStatus, attention: low, source: 'vura.products' };
  },
};

/** Recent orders summary for operations/sales intelligence. */
export const ordersReadTool: AgentTool = {
  name: 'orders.read',
  description: 'Read recent orders with payment/status fields. Does not invent customer or order data.',
  risk: 'read',
  async execute(input) {
    const limit = Math.min(Math.max(asNumber(input, 'limit', 25), 1), 100);
    const status = asString(input, 'status');
    const paymentStatus = asString(input, 'paymentStatus');
    const rows = await sql`
      SELECT o.id, o.order_number, o.quantity, o.total_kobo, o.status, o.payment_status,
             o.delivery_city, o.created_at, p.name AS product_name, p.brand AS product_brand
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE (${status} = '' OR o.status = ${status})
        AND (${paymentStatus} = '' OR o.payment_status = ${paymentStatus})
      ORDER BY o.created_at DESC
      LIMIT ${limit}`;
    const summary = await sql`
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE payment_status = 'unpaid')::int AS unpaid,
        COUNT(*) FILTER (WHERE payment_status = 'pending_verification')::int AS pending_verification,
        COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid,
        COALESCE(SUM(total_kobo) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS paid_revenue_kobo
      FROM orders
      WHERE COALESCE(status, '') <> 'cancelled'`;
    return { orders: rows, summary: summary[0] || null, source: 'vura.orders' };
  },
};

/** Lightweight store analytics from DB aggregates. */
export const analyticsReadTool: AgentTool = {
  name: 'analytics.read',
  description: 'Read store analytics aggregates: product counts, order payment mix, top products by order count.',
  risk: 'read',
  async execute() {
    const [catalog] = await sql`
      SELECT COUNT(*)::int AS products_active,
             COUNT(*) FILTER (WHERE stock_status = 'available')::int AS available
      FROM products WHERE is_active = true`;
    const payments = await sql`
      SELECT COALESCE(payment_status, 'unknown') AS payment_status, COUNT(*)::int AS count
      FROM orders GROUP BY 1 ORDER BY count DESC`;
    const top = await sql`
      SELECT p.name, p.brand, COUNT(o.id)::int AS orders, COALESCE(SUM(o.total_kobo), 0)::bigint AS volume_kobo
      FROM orders o JOIN products p ON p.id = o.product_id
      WHERE COALESCE(o.status, '') <> 'cancelled'
      GROUP BY p.id, p.name, p.brand
      ORDER BY orders DESC
      LIMIT 10`;
    return { catalog, payments, topProducts: top, source: 'vura.analytics' };
  },
};
