import type { VercelRequest, VercelResponse } from '@vercel/node';
import { compare, hash } from 'bcryptjs';
import { sql, json } from '../_lib/db.js';
import { createSession } from '../_lib/auth.js';

function adminEnv() {
  return {
    email: (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
    password: process.env.ADMIN_PASSWORD || '',
    name: (process.env.ADMIN_NAME || 'Vura Admin').trim(),
  };
}

/** Create or force-promote the site owner when credentials match env. */
async function provisionOwner(email: string, password: string) {
  const admin = adminEnv();
  if (!admin.email || !admin.password) return null;
  if (email.toLowerCase().trim() !== admin.email) return null;
  if (password !== admin.password) return null;

  const existing = await sql`
    SELECT id FROM users WHERE email = ${admin.email} LIMIT 1
  `;

  const passwordHash = await hash(admin.password, 12);

  if (existing[0]) {
    const rows = await sql`
      UPDATE users
      SET role = 'admin',
          password_hash = ${passwordHash},
          name = COALESCE(NULLIF(${admin.name}, ''), name),
          updated_at = now()
      WHERE id = ${existing[0].id}
      RETURNING id, name, email, role
    `;
    return rows[0];
  }

  const rows = await sql`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (${admin.name}, ${admin.email}, ${passwordHash}, 'admin')
    RETURNING id, name, email, role
  `;
  return rows[0];
}

/** If this email is the configured owner, force role=admin. */
async function promoteIfOwner(userId: string, email: string) {
  const admin = adminEnv();
  if (!admin.email || email.toLowerCase().trim() !== admin.email) return null;

  const rows = await sql`
    UPDATE users
    SET role = 'admin', updated_at = now()
    WHERE id = ${userId}
    RETURNING id, name, email, role
  `;
  return rows[0] || null;
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
    // 1) Env owner credentials always win → create/promote + sign in
    const owner = await provisionOwner(email, password);
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

    // 2) Normal login
    const rows = await sql`
      SELECT id, name, email, password_hash, role
      FROM users
      WHERE email = ${email.toLowerCase().trim()}
      LIMIT 1
    `;

    if (!rows[0]) {
      return json(res, 401, { error: 'Those details do not match an account.' });
    }

    const valid = await compare(password, rows[0].password_hash);
    if (!valid) {
      return json(res, 401, { error: 'Those details do not match an account.' });
    }

    // 3) If this email is ADMIN_EMAIL, promote even with existing password
    const promoted = await promoteIfOwner(rows[0].id, rows[0].email);
    const user = promoted || {
      id: rows[0].id,
      name: rows[0].name,
      email: rows[0].email,
      role: rows[0].role,
    };

    await createSession(req, res, user.id);
    return json(res, 200, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch {
    return json(res, 500, { error: 'We could not sign you in.' });
  }
}
