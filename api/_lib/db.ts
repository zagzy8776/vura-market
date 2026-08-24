import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL!);

export function json(res: { status: (code: number) => { json: (body: unknown) => void }; setHeader: (key: string, value: string) => void }, status: number, body: unknown) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}
