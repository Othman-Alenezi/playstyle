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
import { Users, Sessions, Feedback } from './db.js';

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

/** Every signed-cookie format, so routing never misses a newer one. */
const STATELESS_PREFIXES = ['v1.', 'v2.'];
export const isStatelessToken = (token) =>
  typeof token === 'string' && STATELESS_PREFIXES.some((p) => token.startsWith(p));

/** How many ratings ride along in the cookie. Keeps it well under 4KB. */
const CARRIED_PICKS = 40;

/**
 * `v2.<payload>.<hmac>`
 *
 * The payload carries the account itself -- id, username, email, and the
 * ratings that make up the taste profile -- not just a reference to it.
 *
 * Why: on a serverless host a freshly registered account exists only in the
 * container that created it. A cookie holding just an id verified fine and
 * then resolved to nothing, which logged the user out on roughly half their
 * clicks. Carrying the account means any container can rebuild it.
 */
function signPayload(payload) {
  const body = `v2.${b64(JSON.stringify(payload))}`;
  const mac = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function buildPayload(userId, expiresAt) {
  const user = Users.byId(userId);
  if (!user) return null;
  const picks = {};
  for (const row of Feedback.forUser(userId).slice(0, CARRIED_PICKS)) {
    picks[row.game_id] = row.signal;
  }
  return {
    i: user.id, u: user.username, e: user.email,
    o: user.onboarded ? 1 : 0, x: expiresAt, p: picks,
  };
}

/** A placeholder hash, computed once, that no password can ever match. */
let unusableHash = null;
const getUnusableHash = () => {
  unusableHash ??= bcrypt.hashSync(randomBytes(24).toString('hex'), 10);
  return unusableHash;
};

/**
 * Recreate an account, and its taste profile, in a container that has never
 * seen it. Only ever called with a payload whose signature we just verified,
 * so the data is ours and trustworthy.
 */
function materialise(payload) {
  try {
    Users.create({
      id: payload.i,
      email: payload.e,
      username: payload.u,
      // The real hash lives in whichever container handled the signup. A
      // password sign-in has to be served by that container; this row exists
      // so an already-authenticated visitor is not thrown out mid-session.
      password_hash: getUnusableHash(),
      created_at: Date.now(),
    });
    if (payload.o) Users.markOnboarded(payload.i);
    const entries = Object.entries(payload.p ?? {})
      .map(([gameId, signal]) => ({ gameId, signal }));
    if (entries.length) Feedback.setMany(payload.i, entries, Date.now());
    return Users.byId(payload.i);
  } catch {
    // A concurrent request may have created it first; re-read either way.
    return Users.byId(payload.i);
  }
}

/**
 * Make the database agree with the ratings carried in the cookie.
 *
 * The cookie is re-issued on every rating, so it is always the freshest copy.
 * A container that already knows this account would otherwise serve its own
 * stale ratings -- so the same person saw a different taste profile and a
 * different set of matches depending on which container answered.
 *
 * Writes only when the two actually differ, so a normal read costs one
 * indexed query.
 */
function reconcilePicks(payload) {
  const carried = payload.p ?? {};
  const carriedKeys = Object.keys(carried);
  if (!carriedKeys.length) return;
  try {
    const current = Feedback.forUser(payload.i);
    const same = current.length === carriedKeys.length
      && current.every((row) => carried[row.game_id] === row.signal);
    if (same) return;

    for (const row of current) {
      if (!(row.game_id in carried)) Feedback.clear(payload.i, row.game_id);
    }
    Feedback.setMany(
      payload.i,
      carriedKeys.map((gameId) => ({ gameId, signal: carried[gameId] })),
      Date.now(),
    );
  } catch {
    // Never fail a request because a profile could not be reconciled.
  }
}

function verifyStateless(token) {
  const parts = token.split('.');
  const version = parts[0];

  // v1 cookies carried only an id. Kept so a cookie issued before this
  // change does not hard-fail, but it cannot be rebuilt if the row is gone.
  if (version === 'v1') {
    if (parts.length !== 4) return null;
    const [, encodedId, expiresRaw, mac] = parts;
    const body = `v1.${encodedId}.${expiresRaw}`;
    if (!safeEqual(mac, createHmac('sha256', SECRET).update(body).digest('base64url'))) return null;
    const expiresAt = Number(expiresRaw);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
    let userId;
    try { userId = unb64(encodedId); } catch { return null; }
    const user = Users.byId(userId);
    return user ? { expires_at: expiresAt, ...user } : null;
  }

  if (version !== 'v2' || parts.length !== 3) return null;
  const [, encoded, mac] = parts;
  const body = `v2.${encoded}`;
  if (!safeEqual(mac, createHmac('sha256', SECRET).update(body).digest('base64url'))) return null;

  let payload;
  try { payload = JSON.parse(unb64(encoded)); } catch { return null; }
  if (!payload?.i || !Number.isFinite(payload.x) || payload.x < Date.now()) return null;

  const user = Users.byId(payload.i) ?? materialise(payload);
  if (!user) return null;
  reconcilePicks(payload);
  return {
    expires_at: payload.x,
    id: user.id, email: user.email, username: user.username,
    created_at: user.created_at, onboarded: user.onboarded,
  };
}

/* ------------------------------- lifecycle -------------------------------- */

export function startSession(res, userId, userAgent) {
  const now = Date.now();
  const expires = now + SESSION_DAYS * 864e5;

  let token;
  if (SESSION_MODE === 'stateless') {
    const payload = buildPayload(userId, expires);
    if (!payload) throw new Error(`cannot start a session for unknown user ${userId}`);
    token = signPayload(payload);
  } else {
    token = randomBytes(32).toString('base64url');
  }

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
  if (isStatelessToken(token)) return verifyStateless(token);
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
  if (token && !isStatelessToken(token)) Sessions.destroy(hashToken(token));
  res.clearCookie(COOKIE, { path: '/' });
}

/**
 * Re-issue the cookie so the ratings it carries stay current.
 * A no-op in database mode, where the cookie holds no account data.
 */
export function refreshSession(res, userId) {
  if (SESSION_MODE !== 'stateless' || !res || !userId) return;
  try {
    startSession(res, userId);
  } catch {
    // Never let a cookie refresh break the request that triggered it.
  }
}

export const publicUser = (u) => ({
  id: u.id, email: u.email, username: u.username, onboarded: !!u.onboarded,
});

export { Users };
