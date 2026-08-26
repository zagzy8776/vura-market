// Rewrites res.cloudinary.com URLs to request resized, optimized variants so
// mobile devices never download original uploads. Non-Cloudinary URLs pass
// through untouched.
export function optimizedImage(url: string | null | undefined, width: number): string {
  if (!url) return '';
  const match = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/)([^/]*)(\/upload\/)(.+)$/);
  if (!match) return url;
  const [, base, , , publicPart] = match;
  const cleanPublic = publicPart.replace(/^[a-z]+_[a-z0-9,]+\/(?=[^/])/i, '');
  return `${base}upload/w_${width},q_auto,f_auto/${cleanPublic}`;
}
