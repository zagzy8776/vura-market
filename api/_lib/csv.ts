// Minimal RFC-4180 CSV utilities: quoted fields, escaped quotes, CRLF aware.
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

export type ProductImportRow = {
  line: number;
  name: string;
  brand: string;
  priceKobo: number;
  description: string;
  stockStatus: 'available' | 'low_stock' | 'out_of_stock' | 'unavailable';
};

export function validateProductImport(csvText: string, maxRows = 500): {
  valid: ProductImportRow[];
  errors: Array<{ line: number; message: string }>;
} {
  const parsed = parseCsv(csvText.trim());
  if (!parsed.length) return { valid: [], errors: [{ line: 1, message: 'CSV is empty.' }] };
  const header = parsed[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const errors: Array<{ line: number; message: string }> = [];
  for (const required of ['name', 'brand', 'price_kobo']) {
    if (col(required) === -1) errors.push({ line: 1, message: `Missing required column "${required}".` });
  }
  if (errors.length) return { valid: [], errors };

  const iName = col('name');
  const iBrand = col('brand');
  const iPrice = col('price_kobo');
  const iDesc = header.indexOf('description');
  const iStock = header.indexOf('stock_status');
  const allowedStock = new Set(['available', 'low_stock', 'out_of_stock', 'unavailable']);
  const dataRows = parsed.slice(1);
  if (dataRows.length > maxRows) errors.push({ line: maxRows + 2, message: `Import limited to ${maxRows} rows per batch.` });

  const valid: ProductImportRow[] = [];
  dataRows.slice(0, maxRows).forEach((cells, idx) => {
    const line = idx + 2;
    const name = (cells[iName] || '').trim();
    const brand = (cells[iBrand] || '').trim();
    const rawPrice = (cells[iPrice] || '').trim();
    const stockRaw = ((iStock === -1 ? '' : cells[iStock]) || '').trim().toLowerCase() || 'available';
    if (!name) { errors.push({ line, message: 'name is required.' }); return; }
    if (name.length > 200) { errors.push({ line, message: 'name exceeds 200 characters.' }); return; }
    if (!brand) { errors.push({ line, message: 'brand is required.' }); return; }
    if (!/^\d+$/.test(rawPrice) || !Number.isSafeInteger(Number(rawPrice)) || Number(rawPrice) <= 0) {
      errors.push({ line, message: 'price_kobo must be a positive whole number of kobo.' });
      return;
    }
    if (!allowedStock.has(stockRaw)) { errors.push({ line, message: `stock_status must be one of ${[...allowedStock].join('/')}.` }); return; }
    valid.push({
      line,
      name,
      brand,
      priceKobo: Number(rawPrice),
      description: (iDesc === -1 ? '' : cells[iDesc] || '').trim(),
      stockStatus: stockRaw as ProductImportRow['stockStatus'],
    });
  });
  return { valid, errors };
}
