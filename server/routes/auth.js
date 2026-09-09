import { Router } from 'express';
import { Users, Feedback } from '../lib/db.js';
import { verifyAccessToken, usernameFrom } from '../lib/supabase.js';
import { COOKIE, issue, clear } from '../lib/session.js';
import { rateLimit, requireAuth } from '../middleware.js';
import { byId } from '../lib/catalog.js';
import { authContext } from '../lib/db-supabase.js';

const router = Router();

const exchangeLimit = rateLimit({
  windowMs: 15 * 60e3, max: 30,
  message: 'Too many sign-in attempts. Wait a few minutes and try again.',
});

/** Quiz picks from before registering, saved with the new account. */
async function applySeed(userId, seed) {
  if (!Array.isArray(seed)) return 0;
  const entries = seed
    .filter((id) => typeof id === 'string' && byId.has(id))
    .slice(0, 30)
    .map((gameId) => ({ gameId, signal: 'love' }));
  if (!entries.length) return 0;
  await Feedback.setMany(userId, entries, Date.now());
  await Users.markOnboarded(userId);
  return entries.length;
}

/**
 * Exchange a verified Supabase access token for this app's session cookie.
 *
 * Registration and sign-in happen in the browser against Supabase, so no
 * password ever reaches this server. We verify the token against Supabase's
 * public JWKS, then store it in an httpOnly cookie -- both so an injected
 * script cannot read it, and because the server needs it to act as that
 * person against the REST API under RLS.
 */
router.post('/supabase', exchangeLimit, async (req, res, next) => {
  try {
    let claims;
    try {
      claims = await verifyAccessToken(req.body?.access_token);
    } catch (err) {
      return res.status(401).json({
        error: 'bad_token',
        message: `Could not verify that sign-in: ${err.message}`,
      });
    }

    const accessToken = req.body.access_token;
    const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : null;
    const expiresAt = (claims.exp ?? 0) * 1000;

    // Act as this person for the rest of the request so RLS applies while we
    // read their profile and save any quiz picks.
    const result = await authContext.run({ accessToken }, async () => {
      // The profile row is created by the on_auth_user_created trigger, so it
      // should already exist; retry briefly in case we beat the trigger.
      let profile = await Users.byId(claims.sub);
      if (!profile) {
        await new Promise((r) => setTimeout(r, 300));
        profile = await Users.byId(claims.sub);
      }
      if (!profile) {
        return { error: { status: 500, body: {
          error: 'no_profile',
          message: 'Your account was created but its profile is missing. Try signing in again.',
        } } };
      }

      const seeded = await applySeed(profile.id, req.body?.seed);
      return {
        user: {
          id: profile.id,
          email: profile.email ?? claims.email ?? null,
          username: profile.username ?? usernameFrom(claims),
          onboarded: !!profile.onboarded || seeded > 0,
        },
        seeded,
      };
    });

    if (result.error) return res.status(result.error.status).json(result.error.body);

    issue(res, { user: result.user, accessToken, refreshToken, expiresAt });
    res.json({ user: result.user, seeded: result.seeded });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  // The session is the cookie, so clearing it is the logout. Supabase tokens
  // are not stored anywhere else.
  clear(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ?? null });
});

/**
 * Account deletion belongs to Supabase Auth, which this server has no
 * privileged key for. Say so rather than failing obscurely.
 */
router.delete('/me', requireAuth, (_req, res) => {
  res.status(501).json({
    error: 'not_supported',
    message: 'Delete your account from Supabase; this app holds no credentials.',
  });
});

export default router;
