import { describe, expect, it } from 'vitest';
import { migrationSqlInsideRunner } from '../scripts/migration-sql.js';

describe('migration transaction integrity', () => {
 it('removes legacy outer BEGIN/COMMIT but leaves SQL and header comments', () => {
   const sql = '-- historical migration\nBEGIN;\nCREATE TABLE demo(id int);\nCOMMIT;\n';
   const result = migrationSqlInsideRunner(sql);
   expect(result).not.toMatch(/BEGIN;|COMMIT;/);
   expect(result).toContain('CREATE TABLE demo');
   expect(result).toContain('-- historical migration');
 });
 it('passes an unwrapped migration without modifying it', () => {
   const sql = '-- new format\nCREATE TABLE demo(id int);';
   expect(migrationSqlInsideRunner(sql)).toBe(sql);
 });
 it('refuses mismatched transaction wrappers', () => {
   expect(() => migrationSqlInsideRunner('BEGIN;\nCREATE TABLE demo(id int);')).toThrow(/Unbalanced/);
 });
 it('preserves inner procedural BEGIN/END blocks', () => {
   const sql = 'BEGIN;\nCREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM 1; END; $$;\nCOMMIT;';
   expect(migrationSqlInsideRunner(sql)).toContain('$$ BEGIN PERFORM 1; END; $$');
 });
});
