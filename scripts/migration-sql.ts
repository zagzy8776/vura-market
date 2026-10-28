/**
 * Migration runner owns a single transaction and migration checksum write.
 * Discard only outer BEGIN/COMMIT wrappers from older migrations,
 * preserving header comments and PL/pgSQL function bodies.
 */
export function migrationSqlInsideRunner(sql: string): string {
  const leading = sql.match(/^((?:\s|--[^\n]*(?:\n|$))*)BEGIN;\s*/i);
  const trailing = /\s*COMMIT;\s*$/i.test(sql);
  if (Boolean(leading) !== trailing) throw new Error('Unbalanced migration transaction wrapper.');
  if (!leading) return sql;
  return sql.slice(0, leading[1].length) +
    sql.slice(leading[0].length).replace(/\s*COMMIT;\s*$/i, '');
}
