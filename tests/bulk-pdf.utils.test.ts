import { describe, it, expect } from 'vitest';
import { parseCsv, validateProductImport } from '../api/_lib/csv';
import { renderTablePdf } from '../api/_lib/pdf';

describe('CSV parsing', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('handles quoted commas, escaped quotes and CRLF', () => {
    const rows = parseCsv('"last, name","say ""hi"""\r\nx,y\r\n');
    expect(rows).toEqual([['last, name', 'say "hi"'], ['x', 'y']]);
  });
});

describe('product import validation', () => {
  const header = 'name,brand,price_kobo,description,stock_status\n';

  it('accepts valid rows', () => {
    const { valid, errors } = validateProductImport(header + 'iPhone 15,Apple,145000000,Nice phone,available');
    expect(errors).toHaveLength(0);
    expect(valid[0]).toMatchObject({ name: 'iPhone 15', brand: 'Apple', priceKobo: 145000000 });
  });
  it('rejects non-positive or malformed prices with row numbers', () => {
    const { errors } = validateProductImport(header + 'A,B,0,\nC,D,-5');
    expect(errors.map((e) => e.line)).toEqual([2, 3]);
  });
  it('requires the mandatory columns', () => {
    const { errors } = validateProductImport('name,brand\nA,B');
    expect(errors[0].message).toContain('price_kobo');
  });
  it('defaults stock status and rejects unknown values', () => {
    const ok = validateProductImport(header + 'A,B,100');
    expect(ok.valid[0].stockStatus).toBe('available');
    const bad = validateProductImport(header + 'A,B,100,,teleported');
    expect(bad.errors[0].message).toContain('stock_status');
  });
});

describe('PDF report generation', () => {
  it('emits a structurally valid PDF document', () => {
    const pdf = renderTablePdf({
      title: 'Vura ledger report',
      subtitle: 'test run',
      headers: ['created_at', 'account', 'amount_kobo'],
      rows: [['2026-01-01', 'SALES_REVENUE', '145000'], ['2026-01-02', 'SUPPLIER_COST', '-120000']],
    });
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
        expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Count 1');
    expect(text).toContain('SALES_REVENUE');
    // xref offsets must point exactly at each object header
    const xrefOffset = Number(text.match(/startxref\n(\d+)/)?.[1]);
    expect(text.slice(xrefOffset, xrefOffset + 4)).toBe('xref');
    const firstObj = text.indexOf('1 0 obj');
    expect(Number(text.match(/xref\n0 \d+\n0000000000 65535 f \n(\d{10})/)?.[1])).toBe(firstObj);
  });
  it('sanitizes non-ASCII currency symbols into the ASCII stream', () => {
    const pdf = renderTablePdf({ title: 'Revenue ₦ report', headers: ['k'], rows: [['₦5']] });
            const str = pdf.toString('latin1');
    // Check that no non-ASCII characters exist (all char codes should be 0-127)
    let hasNonAscii = false;
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 0x7F) { hasNonAscii = true; break; }
    }
    expect(hasNonAscii).toBe(false);
    expect(str).toContain('NGN 5');
  });
});
