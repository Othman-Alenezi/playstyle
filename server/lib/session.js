/**
 * The session cookie.
 *
 * Supabase authenticates the person; this cookie is how the server remembers
 * them and, crucially, where the Supabase tokens live. They are kept in an
 * httpOnly cookie rather than localStorage so an injected script cannot read
 * them, and the server needs the access token anyway to act on the user's
 * behalf against the REST API under RLS.
 *
 * Format: v3.<base64url(json)>.<hmac>. Signed with the same build-time key
 * used elsewhere, so a cookie cannot be forged.
 */
import { createHmac } from 'node:crypto';
import { safeEqual, signingKey } from './auth-key.js';
import { SUPABASE_URL, PUBLISHABLE_KEY } from './supabase.js';

export const COOKIE = 'ps_session';
const DAYS = 30;

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8');

function sign(payload) {
  const body = `v3.${b64(JSON.stringify(payload))}`;
  return `${body}.${createHmac('sha256', signingKey()).update(body).digest('base64url')}`;
}

function open(token) {
  if (typeof token !== 'string' || !token.startsWith('v3.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const body = `${parts[0]}.${parts[1]}`;
  const expected = createHmac('sha256', signingKey()).update(body).digest('base64url');
  if (!safeEqual(parts[2], expected)) return null;
  try { return JSON.parse(unb64(parts[1])); } catch { return null; }
}

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: DAYS * 864e5,
  path: '/',
});

export function issue(res, { user, accessToken, refreshToken, expiresAt }) {
  res.cookie(COOKIE, sign({
    i: user.id, u: user.username, e: user.email, o: user.onboarded ? 1 : 0,
    at: accessToken, rt: refreshToken, x: expiresAt,
  }), cookieOptions());
}

export function clear(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/**
 * Read the cookie, refreshing the Supabase access token if it has expired.
 * Returns null when there is no usable session.
 */
export async function read(cookieValue, res) {
  const payload = open(cookieValue);
  if (!payload?.i || !payload.at) return null;

  let { at: accessToken, rt: refreshToken, x: expiresAt } = payload;

  // Refresh a little early: a token that expires mid-request would fail the
  // REST call rather than the check.
  if (typeof expiresAt === 'number' && expiresAt - Date.now() < 60_000 && refreshToken) {
    const refreshed = await refresh(refreshToken);
    if (!refreshed) return null;
    ({ accessToken, refreshToken, expiresAt } = refreshed);
    if (res) {
      issue(res, {
        user: { id: payload.i, username: payload.u, email: payload.e, onboarded: payload.o },
        accessToken, refreshToken, expiresAt,
      });
    }
  }

  return {
    user: {
      id: payload.i, username: payload.u, email: payload.e, onboarded: !!payload.o,
    },
    accessToken,
  };
}

async function refresh(refreshToken) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
  } catch {
    return null;
  }
}
