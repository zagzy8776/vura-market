import type { VercelRequest, VercelResponse } from '@vercel/node';
import { compare, hash } from 'bcryptjs';
import { sql, json } from '../_lib/db.js';
import { createSession } from '../_lib/auth.js';

/**
 * Ensure the site owner exists as admin when ADMIN_EMAIL + ADMIN_PASSWORD are set.
 * Safe to call on every login attempt — only creates/promotes when credentials match env.
 */
async function ensureOwnerFromEnv(email: string, password: string) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const adminName = (process.env.ADMIN_NAME || 'Vura Admin').trim();

  if (!adminEmail || !adminPassword) return null;
  if (email.toLowerCase().trim() !== adminEmail) return null;
  if (password !== adminPassword) return null;

  const existing = await sql`
    SELECT id, name, email, password_hash, role
    FROM users
    WHERE email = ${adminEmail}
    LIMIT 1
  `;

  if (existing[0]) {
    // Promote to admin if needed, and keep password in sync with env
    const passwordHash = await hash(adminPassword, 12);
    const rows = await sql`
      UPDATE users
      SET role = 'admin',
          password_hash = ${passwordHash},
          name = COALESCE(NULLIF(${adminName}, ''), name),
          updated_at = now()
      WHERE id = ${existing[0].id}
      RETURNING id, name, email, role
    `;
    return rows[0];
  }

  const passwordHash = await hash(adminPassword, 12);
  const rows = await sql`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (${adminName}, ${adminEmail}, ${passwordHash}, 'admin')
    RETURNING id, name, email, role
  `;
  return rows[0];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    email.trim().length < 3 ||
    password.length < 1
  ) {
    return json(res, 400, { error: 'Please check your details.' });
  }

  try {
    // First: try normal login
    const rows = await sql`
      SELECT id, name, email, password_hash, role
      FROM users
      WHERE email = ${email.toLowerCase().trim()}
      LIMIT 1
    `;

    if (rows[0]) {
      const valid = await compare(password, rows[0].password_hash);
      if (valid) {
        await createSession(req, res, rows[0].id);
        return json(res, 200, {
          user: {
            id: rows[0].id,
            name: rows[0].name,
            email: rows[0].email,
            role: rows[0].role,
          },
        });
      }
    }

    // Second: if credentials match ADMIN_* env, create or promote owner
    const owner = await ensureOwnerFromEnv(email, password);
    if (owner) {
      await createSession(req, res, owner.id);
      return json(res, 200, {
        user: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          role: owner.role,
        },
      });
    }

    return json(res, 401, { error: 'Those details do not match an account.' });
  } catch {
    return json(res, 500, { error: 'We could not sign you in.' });
  }
}
