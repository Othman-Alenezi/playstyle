import { COOKIE, read as readSession } from './lib/session.js';
import { authContext } from './lib/db-supabase.js';

/**
 * Resolve the session cookie into req.user, and put the person's Supabase
 * access token into async context for the rest of the request.
 *
 * The data layer reads the token from that context rather than taking it as a
 * parameter, which is why no route had to change when the backend moved to
 * Supabase: RLS sees the real auth.uid() on every query.
 */
export async function attachUser(req, res, next) {
  let session = null;
  try {
    session = await readSession(req.cookies?.[COOKIE], res);
  } catch (err) {
    // Never fail a request because a session could not be read: treat it as
    // signed out and let the route decide whether that matters.
    console.error('[auth] session read failed:', err.message);
  }
  req.user = session?.user ?? null;
  // No token means the anonymous role, which RLS limits to public reads.
  authContext.run({ accessToken: session?.accessToken ?? null }, () => next());
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth_required', message: 'Sign in to continue.' });
  next();
}

/**
 * SameSite=Lax already blocks cross-site form posts; this closes the gap for
 * requests that arrive with no Origin at all or a foreign one.
 */
export function verifyOrigin(allowed) {
  const set = new Set(allowed);
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();

    // Same-origin is always allowed. Without this a deployment would reject
    // every write from its own domain unless ALLOWED_ORIGINS happened to
    // list it, which is a silent 403 on signup, login and posting.
    const host = req.get('host');
    if (host) {
      for (const scheme of ['https://', 'http://']) {
        if (origin === scheme + host) return next();
      }
    }
    if (set.has(origin)) return next();

    return res.status(403).json({ error: 'bad_origin', message: 'Request blocked.' });
  };
}

/**
 * Fixed-window rate limiter, in memory.
 * Deliberately simple: it is per-process, so moving to more than one app
 * server means moving this to Redis. Fine and correct for a single instance.
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let rec = hits.get(k);
    if (!rec || rec.reset < now) rec = { count: 0, reset: now + windowMs };
    rec.count++;
    hits.set(k, rec);
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - rec.count)));
    if (rec.count > max) {
      const secs = Math.ceil((rec.reset - now) / 1000);
      res.set('Retry-After', String(secs));
      return res.status(429).json({
        error: 'rate_limited',
        message: message ?? `Too many attempts. Try again in ${secs}s.`,
      });
    }
    next();
  };
}
