// Runtime SEO helpers. The storefront is an SPA without a known build-time
// domain, so canonical/OG URLs derive from the actual deployment origin and
// structured data reflects only authoritative values already rendered.
function upsertMeta(attribute: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

export const setMeta = upsertMeta;

export function setPageTitle(title?: string) {
  document.title = title ? `${title} — Vura` : 'Vura — Everything you need. One Vura.';
}

export function setCanonicalPath(path: string) {
  const url = `${window.location.origin}${path}`;
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = url;
  upsertMeta('property', 'og:url', url);
}

export function setJsonLd(id: string, data: Record<string, unknown> | null) {
  const selector = `script[type="application/ld+json"][data-seo="${id}"]`;
  document.head.querySelector(selector)?.remove();
  if (!data) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.setAttribute('data-seo', id);
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

/** Site-level Organization + WebSite graph, safe to call on every mount. */
export function setSiteJsonLd() {
  const origin = window.location.origin;
  setJsonLd('site', {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: 'Vura', url: `${origin}/`, logo: `${origin}/favicon.svg` },
      {
        '@type': 'WebSite',
        name: 'Vura',
        url: `${origin}/`,
        potentialAction: { '@type': 'SearchAction', target: `${origin}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
      },
    ],
  });
}
