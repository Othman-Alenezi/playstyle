/**
 * Supabase Auth integration.
 *
 * Registration and sign-in are handled entirely by Supabase, so this app
 * never receives a password. The browser authenticates against Supabase with
 * the publishable key, then hands the resulting access token to this server,
 * which verifies it and issues its own httpOnly session cookie. That keeps
 * every existing route working unchanged and keeps the token out of
 * localStorage, where an XSS could read it.
 *
 * Verification uses the project's *public* JWKS endpoint, so nothing here is
 * a secret and the deployment needs no configuration. The publishable key is
 * designed to be embedded in client code -- that is what "publishable" means.
 */
import { createPublicKey, verify as verifySignature } from 'node:crypto';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'juxzjoensokjwmvoaesj';
export const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_bIwfz0OS3Gt21A35anlq9w_zAhap0qa';

export const SUPABASE_URL = process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
export const SUPABASE_ENABLED = !!(SUPABASE_URL && PUBLISHABLE_KEY);
const JWKS_URL = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
const ISSUER = `${SUPABASE_URL}/auth/v1`;

/** What the browser needs to talk to Supabase. All of it is public. */
export const clientConfig = () => (SUPABASE_ENABLED
  ? { url: SUPABASE_URL, publishableKey: PUBLISHABLE_KEY }
  : null);

/* ---------------------------------- JWKS ---------------------------------- */

let cache = { keys: new Map(), fetchedAt: 0 };
const CACHE_MS = 10 * 60e3;

async function keyFor(kid) {
  const fresh = Date.now() - cache.fetchedAt < CACHE_MS;
  if (fresh && cache.keys.has(kid)) return cache.keys.get(kid);

  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = await res.json();

  const next = new Map();
  for (const jwk of keys ?? []) {
    if (!jwk.kid) continue;
    try {
      next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
    } catch { /* skip a key shape we cannot use */ }
  }
  cache = { keys: next, fetchedAt: Date.now() };

  const key = next.get(kid);
  if (!key) throw new Error(`no signing key for kid ${kid}`);
  return key;
}

const b64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Verify a Supabase access token and return its claims.
 * Throws on anything suspicious rather than returning a partial result.
 */
export async function verifyAccessToken(token) {
  if (typeof token !== 'string') throw new Error('no token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [headerB64, payloadB64, signatureB64] = parts;

  let header;
  try {
    header = JSON.parse(b64url(headerB64).toString('utf8'));
  } catch { throw new Error('malformed token header'); }
  // Only the asymmetric algorithm is accepted. Allowing HS256 here would mean
  // trusting a token signed with a shared secret this server does not hold.
  if (header.alg !== 'ES256') throw new Error(`unexpected alg ${header.alg}`);
  if (!header.kid) throw new Error('no kid');

  const key = await keyFor(header.kid);
  const ok = verifySignature(
    'sha256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    { key, dsaEncoding: 'ieee-p1363' },   // JOSE uses raw r||s, not DER
    b64url(signatureB64),
  );
  if (!ok) throw new Error('bad signature');

  let claims;
  try {
    claims = JSON.parse(b64url(payloadB64).toString('utf8'));
  } catch { throw new Error('malformed token payload'); }
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp < now) throw new Error('token expired');
  if (typeof claims.iat === 'number' && claims.iat > now + 60) throw new Error('token from the future');
  if (claims.iss !== ISSUER) throw new Error(`unexpected issuer ${claims.iss}`);
  if (claims.aud !== 'authenticated' && !claims.aud?.includes?.('authenticated')) {
    throw new Error('not an authenticated audience');
  }
  if (!claims.sub) throw new Error('no subject');
  return claims;
}

/** Marks a local row whose credentials live in Supabase, not here. */
export const EXTERNAL_AUTH_MARKER = 'supabase-auth:no-local-password';

/** A username for the local mirror, from sign-up metadata or the email. */
export function usernameFrom(claims) {
  const meta = claims.user_metadata ?? {};
  const candidate = String(meta.username ?? '').trim();
  if (/^[a-zA-Z0-9_]{3,20}$/.test(candidate)) return candidate;
  const local = String(claims.email ?? '').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
  if (local.length >= 3) return local.slice(0, 20);
  return `player_${String(claims.sub).replace(/-/g, '').slice(0, 8)}`;
}
