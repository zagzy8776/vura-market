// Rewrites res.cloudinary.com URLs to request resized, optimized variants so
// mobile devices never download original uploads. Non-Cloudinary URLs pass
// through untouched.
//
// Correct Cloudinary form:
//   https://res.cloudinary.com/<cloud>/image/upload/<transforms>/<public_id>
export function optimizedImage(url: string | null | undefined, width: number): string {
  if (!url) return '';
  const match = url.match(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/)(image|video|raw)(\/upload\/)(.+)$/i,
  );
  if (!match) return url;
  const [, base, resourceType, , publicPart] = match;
  // Strip any existing transformation segment (e.g. w_560,q_auto/) so we don't nest them
  const cleanPublic = publicPart.replace(/^(?:[a-z]+_[a-z0-9,.:]+\/)+/i, '');
  return `${base}${resourceType}/upload/w_${width},q_auto,f_auto/${cleanPublic}`;
}
