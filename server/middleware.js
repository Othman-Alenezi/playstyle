import { COOKIE, readSession } from './lib/auth.js';

/** Resolve the session cookie into req.user (or null) on every request. */
export function attachUser(req, _res, next) {
  const row = readSession(req.cookies?.[COOKIE]);
  req.user = row ? { id: row.id, email: row.email, username: row.username, onboarded: !!row.onboarded } : null;
  next();
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
    if (origin && !set.has(origin)) {
      return res.status(403).json({ error: 'bad_origin', message: 'Request blocked.' });
    }
    next();
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
