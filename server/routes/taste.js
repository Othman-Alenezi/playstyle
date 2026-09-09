import { Router } from 'express';
import { Feedback, Users } from '../lib/db.js';
import { byId, publicGame } from '../lib/catalog.js';
import { recommend, tasteProfile, SIGNAL_WEIGHT } from '../lib/recommend.js';
import { requireAuth } from '../middleware.js';

const router = Router();
const SIGNALS = Object.keys(SIGNAL_WEIGHT);

const cleanIds = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((id) => typeof id === 'string' && byId.has(id))
    .slice(0, 30);

/**
 * Guest preview: run the recommender on picks that were never saved, so the
 * quiz can show real results before asking anyone to create an account.
 */
router.post('/preview', (req, res) => {
  const ids = cleanIds(req.body?.gameIds);
  if (ids.length < 1) {
    return res.status(400).json({ error: 'need_picks', message: 'Pick at least one game.' });
  }
  const rows = ids.map((game_id) => ({ game_id, signal: 'love' }));
  const { items } = recommend(rows, { limit: Number(req.body?.limit) || 3 });
  res.json({ items, profile: tasteProfile(rows, 6) });
});

router.post('/seed', requireAuth, async (req, res, next) => {
  try {
    const ids = cleanIds(req.body?.gameIds);
    if (!ids.length) return res.status(400).json({ error: 'need_picks', message: 'Pick at least one game.' });
    await Feedback.setMany(req.user.id, ids.map((gameId) => ({ gameId, signal: 'love' })), Date.now());
    await Users.markOnboarded(req.user.id);
      res.json({ ok: true, saved: ids.length });
  } catch (err) { next(err); }
});

/**
 * Replace the set of games marked "love" with exactly the ids given.
 *
 * The taste quiz needs to remove picks as well as add them -- there was no way
 * to take a game back out of a profile once it was in. Other signals
 * (wishlist, played, not-for-me) are left alone, so re-running the quiz does
 * not wipe ratings made from the feed.
 */
router.put('/library', requireAuth, async (req, res, next) => {
  try {
  const wanted = new Set(cleanIds(req.body?.gameIds));
  const rows = await Feedback.forUser(req.user.id);

  let removed = 0;
  for (const row of rows) {
    if (row.signal === 'love' && !wanted.has(row.game_id)) {
      await Feedback.clear(req.user.id, row.game_id);
      removed++;
    }
  }
  const existing = new Set(rows.map((r) => r.game_id));
  const added = [...wanted].filter((id) => !existing.has(id));
  if (added.length) {
    await Feedback.setMany(req.user.id, added.map((gameId) => ({ gameId, signal: 'love' })), Date.now());
  }
  if (wanted.size) await Users.markOnboarded(req.user.id);

  const now = await Feedback.forUser(req.user.id);
  res.json({ ok: true, added: added.length, removed, total: now.length, profile: tasteProfile(now) });
  } catch (err) { next(err); }
});

router.get('/profile', requireAuth, async (req, res, next) => {
  try {
  const rows = await Feedback.forUser(req.user.id);
  res.json({
    profile: tasteProfile(rows),
    library: rows.map((r) => ({ ...publicGame(byId.get(r.game_id) ?? { id: r.game_id, title: r.game_id, genres: [], tags: [] }), signal: r.signal })),
    counts: rows.reduce((acc, r) => ({ ...acc, [r.signal]: (acc[r.signal] ?? 0) + 1 }), {}),
  });
  } catch (err) { next(err); }
});

router.get('/recommendations', requireAuth, async (req, res, next) => {
  try {
  const rows = await Feedback.forUser(req.user.id);
  if (!rows.length) {
    return res.json({ items: [], needsOnboarding: true, profile: { top: [], genres: [], seeds: [] } });
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 24);
  const { items } = recommend(rows, { limit });
  res.json({ items, needsOnboarding: false, profile: tasteProfile(rows) });
  } catch (err) { next(err); }
});

router.post('/feedback', requireAuth, async (req, res, next) => {
  try {
  const { gameId, signal } = req.body ?? {};
  if (!byId.has(gameId)) return res.status(404).json({ error: 'not_found', message: 'No such game.' });
  if (!SIGNALS.includes(signal)) {
    return res.status(400).json({ error: 'bad_signal', message: `signal must be one of ${SIGNALS.join(', ')}` });
  }
  await Feedback.set(req.user.id, gameId, signal);
  const rows = await Feedback.forUser(req.user.id);
  // Return the refreshed profile so the client can update the taste bars in
  // the same round trip -- one request per interaction, no refetch.
  res.json({ ok: true, profile: tasteProfile(rows) });
  } catch (err) { next(err); }
});

router.delete('/feedback/:gameId', requireAuth, async (req, res, next) => {
  try {
    await Feedback.clear(req.user.id, req.params.gameId);
      res.json({ ok: true, profile: tasteProfile(await Feedback.forUser(req.user.id)) });
  } catch (err) { next(err); }
});

export default router;
