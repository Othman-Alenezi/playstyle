/**
 * Password hashing and sessions.
 *
 * Two session strategies, chosen by where the app is running:
 *
 * - **Database-backed** (default, local and any normal server). The cookie is
 *   an opaque random token; the server stores only an HMAC of it. Sessions can
 *   be revoked server-side, which is the better design.
 *
 * - **Stateless signed cookie** (serverless). There is no shared database
 *   between serverless containers -- each gets its own copy -- so a session
 *   row written by one container does not exist in the next, and the user is
 *   logged out the moment a request lands elsewhere. Signing the identity into
 *   the cookie means any container can verify it with the shared key.
 *   The trade-off is that these cannot be revoked before they expire.
 */
import bcrypt from 'bcryptjs';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Users, Sessions } from './db.js';

const BCRYPT_ROUNDS = 12;
const SESSION_DAYS = 30;
export const COOKIE = 'ps_session';

const EPHEMERAL_HOST = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const KEY_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.session-key');

/**
 * The signing key, in order of preference:
 *   1. SESSION_SECRET  -- what a real deployment should set.
 *   2. .session-key    -- written once at build time, so every container of a
 *                         deployment shares it (see scripts/gen-session-key.mjs).
 *   3. a dev constant  -- local development only.
 * A per-process random key is never used: it would silently log everyone out
 * as soon as a second container started.
 */
function resolveSecret() {
  if (process.env.SESSION_SECRET) return { key: process.env.SESSION_SECRET, source: 'env' };
  if (existsSync(KEY_FILE)) {
    const key = readFileSync(KEY_FILE, 'utf8').trim();
    if (key.length >= 32) return { key, source: 'build-key' };
  }
  if (process.env.NODE_ENV !== 'production') {
    return { key: 'dev-only-insecure-secret', source: 'dev-default' };
  }
  throw new Error(
    'No session signing key. Set SESSION_SECRET, or run `node scripts/gen-session-key.mjs` '
    + 'during the build. See .env.example');
}
const { key: SECRET, source: SECRET_SOURCE } = resolveSecret();

/** Stateless cookies only where there is no shared database to hold sessions. */
export const SESSION_MODE = EPHEMERAL_HOST ? 'stateless' : 'database';
export const sessionInfo = () => ({ mode: SESSION_MODE, keySource: SECRET_SOURCE });

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

/* --------------------------- stateless cookies ---------------------------- */

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8');

/** `v1.<userId>.<expiresAt>.<hmac>` -- verifiable by any container. */
function signStateless(userId, expiresAt) {
  const body = `v1.${b64(userId)}.${expiresAt}`;
  const mac = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verifyStateless(token) {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const [, encodedId, expiresRaw, mac] = parts;
  const body = `v1.${encodedId}.${expiresRaw}`;
  const expected = createHmac('sha256', SECRET).update(body).digest('base64url');
  if (!safeEqual(mac, expected)) return null;

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  let userId;
  try { userId = unb64(encodedId); } catch { return null; }
  const user = Users.byId(userId);
  if (!user) return null;

  // Same shape the database-backed lookup returns.
  return {
    expires_at: expiresAt,
    id: user.id, email: user.email, username: user.username,
    created_at: user.created_at, onboarded: user.onboarded,
  };
}

/* ------------------------------- lifecycle -------------------------------- */

export function startSession(res, userId, userAgent) {
  const now = Date.now();
  const expires = now + SESSION_DAYS * 864e5;

  const token = SESSION_MODE === 'stateless'
    ? signStateless(userId, expires)
    : randomBytes(32).toString('base64url');

  if (SESSION_MODE === 'database') {
    Sessions.create(hashToken(token), userId, now, expires, (userAgent || '').slice(0, 200));
  }

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
  // Read whichever format the cookie is in, so a mode change (or a redeploy)
  // does not hard-fail on a cookie the browser is still holding.
  if (token.startsWith('v1.')) return verifyStateless(token);
  const row = Sessions.find(hashToken(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    Sessions.destroy(hashToken(token));
    return null;
  }
  return row;
}

export function endSession(res, token) {
  // A stateless cookie has no server-side row; clearing it is the logout.
  if (token && !token.startsWith('v1.')) Sessions.destroy(hashToken(token));
  res.clearCookie(COOKIE, { path: '/' });
}

export const publicUser = (u) => ({
  id: u.id, email: u.email, username: u.username, onboarded: !!u.onboarded,
});

export { Users };
