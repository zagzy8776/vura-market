/** Nigerian-friendly phone helpers for Call + WhatsApp. */

export function digitsOnly(raw: string | null | undefined) {
  return String(raw || '').replace(/[^\d+]/g, '');
}

/** E.164-ish for NG: 0803… → 234803…, +234 → 234 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  let d = digitsOnly(raw);
  if (!d) return null;
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('234') && d.length >= 13) return d;
  if (d.startsWith('0') && d.length >= 11) return `234${d.slice(1)}`;
  if (d.length === 10) return `234${d}`;
  if (d.length >= 10) return d.replace(/^0+/, '');
  return null;
}

export function telHref(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw);
  if (!d || d.replace(/\D/g, '').length < 7) return null;
  return `tel:${d.startsWith('+') ? d : d.startsWith('0') ? d : `+${d}`}`;
}

export function waHref(raw: string | null | undefined, text?: string): string | null {
  const n = toWhatsAppNumber(raw);
  if (!n) return null;
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${n}${q}`;
}

export function orderWhatsAppText(orderNumber?: string | null, kind: 'order' | 'payment' | 'delivery' = 'order') {
  const n = orderNumber ? ` ${orderNumber}` : '';
  if (kind === 'payment') return `Hi, this is Vura. We are confirming payment for your order${n}.`;
  if (kind === 'delivery') return `Hi, this is Vura. We are delivering your order${n} today. Please confirm your address.`;
  return `Hi, this is Vura about your order${n}.`;
}
