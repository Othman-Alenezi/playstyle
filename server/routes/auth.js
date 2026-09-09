import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { Users, Feedback } from '../lib/db.js';
import {
  hashPassword, checkPassword, startSession, endSession, publicUser, COOKIE,
  isRebuiltAccount,
} from '../lib/auth.js';
import { validateSignup, validateLogin } from '../lib/validate.js';
import { rateLimit, requireAuth } from '../middleware.js';
import { byId } from '../lib/catalog.js';

const router = Router();

const signupLimit = rateLimit({ windowMs: 60 * 60e3, max: 10, message: 'Too many accounts from this address. Try again later.' });
const loginLimit = rateLimit({
  windowMs: 15 * 60e3, max: 12,
  // Key on IP + email so one attacker cannot lock out a whole office NAT,
  // and cannot spray one password across many accounts either.
  key: (req) => `${req.ip}|${String(req.body?.email ?? '').toLowerCase()}`,
  message: 'Too many sign-in attempts. Wait a few minutes and try again.',
});

/** Seed picks from the guest taste quiz, saved with the new account. */
async function applySeed(userId, seed) {
  if (!Array.isArray(seed)) return 0;
  const entries = seed
    .filter((id) => typeof id === 'string' && byId.has(id))
    .slice(0, 30)
    .map((gameId) => ({ gameId, signal: 'love' }));
  if (entries.length) {
    await Feedback.setMany(userId, entries, Date.now());
    await Users.markOnboarded(userId);
  }
  return entries.length;
}

router.post('/signup', signupLimit, async (req, res, next) => {
  try {
    const { errors, value } = validateSignup(req.body ?? {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'invalid', fields: errors });

    // This does confirm an email is registered. That is a deliberate trade:
    // without it, "account already exists" becomes an unexplained failure.
    const existingByEmail = await Users.byEmail(value.email);
    if (existingByEmail && !isRebuiltAccount(existingByEmail)) {
      return res.status(409).json({ error: 'email_taken', fields: { email: 'That email already has an account.' } });
    }
    const existingByName = await Users.byUsername(value.username);
    if (existingByName && !isRebuiltAccount(existingByName)) {
      return res.status(409).json({ error: 'username_taken', fields: { username: 'That username is taken.' } });
    }
    // A rebuilt row holds no password anyone can use, so let the person who
    // owns the address claim it rather than locking them out of their own
    // email. Only reachable on a host where accounts get rebuilt from a cookie.
    for (const stale of [existingByEmail, existingByName]) {
      if (stale && isRebuiltAccount(stale)) await Users.destroy(stale.id);
    }

    const user = {
      id: randomUUID(),
      email: value.email,
      username: value.username,
      password_hash: await hashPassword(value.password),
      created_at: Date.now(),
    };
    await Users.create(user);
    const seeded = await applySeed(user.id, req.body?.seed);
    await startSession(res, user.id, req.get('user-agent'));
    res.status(201).json({ user: { ...publicUser(user), onboarded: seeded > 0 }, seeded });
  } catch (err) { next(err); }
});

router.post('/login', loginLimit, async (req, res, next) => {
  try {
    const { errors, value } = validateLogin(req.body ?? {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'invalid', fields: errors });

    const user = await Users.byEmail(value.email);

    // A rebuilt account cannot verify a password here. Say so plainly rather
    // than returning "incorrect password" for a password that is correct.
    if (user && isRebuiltAccount(user)) {
      return res.status(409).json({
        error: 'rebuilt_account',
        message: 'This account was created on the live demo, where each server keeps its own '
          + 'copy of the data, so its password cannot be checked here. You usually stay signed '
          + 'in without logging in again. Otherwise sign up again, or use a demo account.',
      });
    }

    // Always run a comparison so a missing account and a wrong password take
    // the same amount of time and return the same message.
    const ok = user
      ? await checkPassword(value.password, user.password_hash)
      : await checkPassword(value.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    if (!user || !ok) {
      return res.status(401).json({ error: 'bad_credentials', message: 'Email or password is incorrect.' });
    }

    const seeded = await applySeed(user.id, req.body?.seed);
    await startSession(res, user.id, req.get('user-agent'));
    res.json({ user: publicUser(await Users.byId(user.id)), seeded });
  } catch (err) { next(err); }
});

router.post('/logout', async (req, res, next) => {
  try {
    await endSession(res, req.cookies?.[COOKIE]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ?? null });
});

/** Account deletion. Cascades to sessions and feedback. */
router.delete('/me', requireAuth, async (req, res, next) => {
  try {
    await Users.destroy(req.user.id);
    await endSession(res, req.cookies?.[COOKIE]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
