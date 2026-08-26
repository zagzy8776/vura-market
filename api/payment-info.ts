import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const rows = await sql`SELECT key, value FROM platform_settings WHERE key IN ('payment_method', 'payout_account_number', 'payout_account_name', 'payout_bank_name', 'support_whatsapp', 'support_phone', 'store_name')`;
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return json(res, 200, {
      paymentMethod: settings.payment_method || 'bank_transfer',
      accountNumber: settings.payout_account_number || '',
      accountName: settings.payout_account_name || '',
      bankName: settings.payout_bank_name || '',
      supportWhatsapp: settings.support_whatsapp || '',
      supportPhone: settings.support_phone || '',
      storeName: settings.store_name || 'Vura',
    });
  } catch {
    return json(res, 500, { error: 'Payment instructions are temporarily unavailable.' });
  }
}
