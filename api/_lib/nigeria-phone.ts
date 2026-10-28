/** Canonical +234 phone format. Phone ownership is not verified here. */
export function normalizeNigeriaPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  const prefixed = digits.startsWith('0') ? '234' + digits.slice(1) : digits;
  if (!/^234[789]\d{9}$/.test(prefixed)) return null;
  return '+' + prefixed;
}
