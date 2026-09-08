/** Password hashing and opaque session tokens. */
import bcrypt from 'bcryptjs';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { Users, Sessions } from './db.js';

const BCRYPT_ROUNDS = 12;
const SESSION_DAYS = 30;
export const COOKIE = 'ps_session';

const SECRET = process.env.SESSION_SECRET || 'dev-only-insecure-secret';
if (process.env.NODE_ENV === 'production' && SECRET === 'dev-only-insecure-secret') {
  throw new Error('SESSION_SECRET must be set in production. See .env.example');
}

/**
 * Sessions are stored as an HMAC of the token, never the token itself, so a
 * leaked database cannot be replayed as a set of live logins.
 */
const hashToken = (token) => createHmac('sha256', SECRET).update(token).digest('hex');

export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const checkPassword = (plain, hash) => bcrypt.compare(plain, hash);

/** Constant-time compare that tolerates length differences. */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function startSession(res, userId, userAgent) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const expires = now + SESSION_DAYS * 864e5;
  Sessions.create(hashToken(token), userId, now, expires, (userAgent || '').slice(0, 200));
  res.cookie(COOKIE, token, {
    httpOnly: true,                                  // JS cannot read it, so XSS cannot steal it
    sameSite: 'lax',                                 // blocks cross-site form CSRF
    secure: process.env.NODE_ENV === 'production',   // HTTPS only once deployed
    maxAge: SESSION_DAYS * 864e5,
    path: '/',
  });
  return token;
}

export function readSession(token) {
  if (!token) return null;
  const row = Sessions.find(hashToken(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    Sessions.destroy(hashToken(token));
    return null;
  }
  return row;
}

export function endSession(res, token) {
  if (token) Sessions.destroy(hashToken(token));
  res.clearCookie(COOKIE, { path: '/' });
}

export const publicUser = (u) => ({
  id: u.id, email: u.email, username: u.username, onboarded: !!u.onboarded,
});

export { Users };
