/** All money is stored in kobo (1 NGN = 100 kobo). Never trust client-side calculations. */
export function money(kobo: number | string | null | undefined): string {
  const value = Number(kobo) || 0;
  return `₦${(value / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

export function kobo(ngn: number): number {
  return Math.round(ngn * 100);
}

export function formatKobo(kobo: number | string | null | undefined): string {
  return money(kobo);
}
