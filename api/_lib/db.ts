/// <reference types="node" />
import { neon } from '@neondatabase/serverless';
import { requireEnvironment } from './env.js';

requireEnvironment();

export const sql = neon(process.env.DATABASE_URL!);

/** Eventual-consistency reads ONLY; never route orders, inventory, auth, or payments here. */
export const publicReadSql = process.env.DATABASE_READ_URL
  ? neon(process.env.DATABASE_READ_URL)
  : sql;

export function json(res: { status: (code: number) => { json: (body: unknown) => void }; setHeader: (key: string, value: string) => void }, status: number, body: unknown) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}
