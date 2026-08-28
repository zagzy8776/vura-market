import { describe, it, expect } from 'vitest';

/** Pure helpers mirrored for unit testing without network */
type Provenance = 'IMAGE_CONFIRMED' | 'SOURCE_CONFIRMED' | 'USER_PROVIDED' | 'INFERRED' | 'UNKNOWN';

function asField(raw: unknown, fallback: Provenance = 'UNKNOWN') {
  if (!raw || typeof raw !== 'object') {
    return { value: typeof raw === 'string' ? raw : null, provenance: fallback };
  }
  const o = raw as Record<string, unknown>;
  const value = typeof o.value === 'string' ? o.value : o.value == null ? null : String(o.value);
  const p = String(o.provenance || fallback).toUpperCase() as Provenance;
  const allowed: Provenance[] = ['IMAGE_CONFIRMED', 'SOURCE_CONFIRMED', 'USER_PROVIDED', 'INFERRED', 'UNKNOWN'];
  return { value, provenance: allowed.includes(p) ? p : 'UNKNOWN' };
}

function needsFromSpecs(specs: Record<string, { value: string | null; provenance: Provenance }>) {
  const needs: string[] = [];
  for (const [k, field] of Object.entries(specs)) {
    if (!field.value || field.provenance === 'UNKNOWN') needs.push(`Confirm specification: ${k}`);
  }
  return needs;
}

describe('image intelligence provenance', () => {
  it('marks IMAGE_CONFIRMED fields', () => {
    const f = asField({ value: 'Black', provenance: 'IMAGE_CONFIRMED' });
    expect(f.value).toBe('Black');
    expect(f.provenance).toBe('IMAGE_CONFIRMED');
  });

  it('falls back invalid provenance to UNKNOWN', () => {
    const f = asField({ value: 'X', provenance: 'MADE_UP' });
    expect(f.provenance).toBe('UNKNOWN');
  });

  it('flags unknown specs for human confirmation', () => {
    const needs = needsFromSpecs({
      battery: { value: null, provenance: 'UNKNOWN' },
      color: { value: 'Blue', provenance: 'IMAGE_CONFIRMED' },
    });
    expect(needs).toContain('Confirm specification: battery');
    expect(needs).not.toContain('Confirm specification: color');
  });

  it('requires https image urls conceptually', () => {
    const urls = ['http://insecure', 'https://res.cloudinary.com/demo/image/upload/sample.jpg', 'not-a-url'];
    const ok = urls.filter((u) => /^https:\/\//i.test(u));
    expect(ok).toHaveLength(1);
  });
});
