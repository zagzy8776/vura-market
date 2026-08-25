export function bodyObject(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

export function requiredString(value: unknown, field: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`INVALID_${field.toUpperCase()}`);
  return value.trim();
}

export function optionalString(value: unknown, max = 500): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) throw new Error('INVALID_INPUT');
  return value.trim();
}

export function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error(`INVALID_${field.toUpperCase()}`);
  return value;
}

export function enumValue<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`INVALID_${field.toUpperCase()}`);
  return value as T;
}
