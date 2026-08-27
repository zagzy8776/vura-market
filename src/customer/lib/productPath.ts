/** Stable product URL: prefer SEO slug, fall back to id (never "undefined"). */
export function productPath(product: { slug?: string | null; id: string }): string {
  const slug = (product.slug || '').trim();
  if (slug && slug !== 'undefined') return `/product/${slug}`;
  return `/product/${product.id}`;
}

export function productKey(product: { slug?: string | null; id: string }): string {
  const slug = (product.slug || '').trim();
  if (slug && slug !== 'undefined') return slug;
  return product.id;
}
