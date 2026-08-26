// Minimal dependency-free PDF writer for tabular finance reports.
// Produces valid PDF 1.4 single-font documents (Courier for column alignment).
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function toAscii(s: string): string {
  return s.replace(/₦/g, 'NGN ').replace(/[^\x20-\x7E]/g, '?');
}

export function renderTablePdf(options: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  rowLimit?: number;
}): Buffer {
  const { title, subtitle, headers, rows } = options;
  const rowLimit = options.rowLimit ?? 2000;

    const width = Math.max(...headers.map((h) => h.length), 1);
  const colWidth = headers.map((h, i) => {
    const cells = rows.map((r) => toAscii(r[i] ?? ''));
    return Math.min(Math.max(h.length, ...cells.map((c) => c.length), width), 40);
  });
  const fmt = (cells: string[]) =>
    cells.map((c, i) => toAscii(c ?? '').slice(0, colWidth[i]).padEnd(colWidth[i])).join(' | ');

  const lines: string[] = [];
  lines.push(toAscii(title));
  if (subtitle) lines.push(toAscii(subtitle));
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(fmt(headers));
  lines.push('-'.repeat(Math.min(fmt(headers).length, 120)));
  for (const row of rows.slice(0, rowLimit)) lines.push(fmt(row));
  if (rows.length > rowLimit) lines.push(`... ${rows.length - rowLimit} further rows omitted (export CSV for the full set)`);

  const perPage = 60;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (!pages.length) pages.push(['(no data)']);

  const pageCount = pages.length;
  const maxObj = 3 + 2 * pageCount; // catalog, pages, font, then page/content pairs
  const objects: string[] = new Array(maxObj + 1).fill('');

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, k) => `${4 + k * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>';
  pages.forEach((chunk, k) => {
    const pageNum = 4 + k * 2;
    const contentNum = pageNum + 1;
    let stream = 'BT /F1 8 Tf 11 TL 36 800 Td\n';
    for (const line of chunk) stream += `(${esc(line)}) Tj T*\n`;
    stream += 'ET';
    objects[pageNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>`;
    objects[contentNum] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  });

  let out = '%PDF-1.4\n';
  const offsets: number[] = new Array(maxObj + 1).fill(0);
  for (let n = 1; n <= maxObj; n++) {
    offsets[n] = Buffer.byteLength(out);
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(out);
  let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= maxObj; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  out += xref;
  out += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
