import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

import { query } from './db.js';

const RAW_JWT_SECRET = process.env.JWT_SECRET ?? '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && (!RAW_JWT_SECRET || RAW_JWT_SECRET === 'dev-secret-change-me' || RAW_JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to a strong value (>=32 chars) in production');
}

const JWT_SECRET = RAW_JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN: SignOptions['expiresIn'] = (process.env.JWT_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'];

export type UserRole = 'user' | 'admin' | 'super_admin';

export interface ApiUser {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    email: string;
    sessionId?: string;
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signAccessToken(payload: { userId: string; email: string; sessionId?: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice('Bearer '.length).trim();
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = readBearerToken(req);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  let payload: { userId: string; email: string; sessionId?: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; sessionId?: string };
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Enforce the server-side session so logout actually revokes access (the JWT alone
  // would otherwise stay valid until natural expiry). Tokens we issue always carry a
  // sessionId; reject if the backing session row is gone or expired.
  if (payload.sessionId) {
    try {
      const result = await query<{ id: string }>(
        'SELECT id FROM sessions WHERE id = $1 AND expires_at > NOW()',
        [payload.sessionId],
      );
      if (!result.rows[0]) {
        res.status(401).json({ error: 'Session expired or revoked' });
        return;
      }
    } catch {
      res.status(500).json({ error: 'Authentication check failed' });
      return;
    }
  }

  req.auth = payload;
  next();
}

export async function sanitizeUserById(userId: string): Promise<ApiUser | null> {
  const result = await query<{
    id: string;
    email: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    role: UserRole;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, email, username, avatar_url, bio, role, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [userId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    role: row.role ?? 'user',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
