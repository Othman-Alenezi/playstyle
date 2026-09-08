import { Router } from 'express';
import { Feedback, Users } from '../lib/db.js';
import { byId, publicGame } from '../lib/catalog.js';
import { recommend, tasteProfile, SIGNAL_WEIGHT } from '../lib/recommend.js';
import { requireAuth } from '../middleware.js';
import { refreshSession } from '../lib/auth.js';

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

router.post('/seed', requireAuth, (req, res) => {
  const ids = cleanIds(req.body?.gameIds);
  if (!ids.length) return res.status(400).json({ error: 'need_picks', message: 'Pick at least one game.' });
  Feedback.setMany(req.user.id, ids.map((gameId) => ({ gameId, signal: 'love' })), Date.now());
  Users.markOnboarded(req.user.id);
  // Keep the ratings carried in the session cookie in step with the database,
  // so a container that has to rebuild this account rebuilds it complete.
  refreshSession(res, req.user.id);
  res.json({ ok: true, saved: ids.length });
});

router.get('/profile', requireAuth, (req, res) => {
  const rows = Feedback.forUser(req.user.id);
  res.json({
    profile: tasteProfile(rows),
    library: rows.map((r) => ({ ...publicGame(byId.get(r.game_id) ?? { id: r.game_id, title: r.game_id, genres: [], tags: [] }), signal: r.signal })),
    counts: rows.reduce((acc, r) => ({ ...acc, [r.signal]: (acc[r.signal] ?? 0) + 1 }), {}),
  });
});

router.get('/recommendations', requireAuth, (req, res) => {
  const rows = Feedback.forUser(req.user.id);
  if (!rows.length) {
    return res.json({ items: [], needsOnboarding: true, profile: { top: [], genres: [], seeds: [] } });
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 24);
  const { items } = recommend(rows, { limit });
  res.json({ items, needsOnboarding: false, profile: tasteProfile(rows) });
});

router.post('/feedback', requireAuth, (req, res) => {
  const { gameId, signal } = req.body ?? {};
  if (!byId.has(gameId)) return res.status(404).json({ error: 'not_found', message: 'No such game.' });
  if (!SIGNALS.includes(signal)) {
    return res.status(400).json({ error: 'bad_signal', message: `signal must be one of ${SIGNALS.join(', ')}` });
  }
  Feedback.set(req.user.id, gameId, signal);
  refreshSession(res, req.user.id);
  const rows = Feedback.forUser(req.user.id);
  // Return the refreshed profile so the client can update the taste bars in
  // the same round trip -- one request per interaction, no refetch.
  res.json({ ok: true, profile: tasteProfile(rows) });
});

router.delete('/feedback/:gameId', requireAuth, (req, res) => {
  Feedback.clear(req.user.id, req.params.gameId);
  refreshSession(res, req.user.id);
  res.json({ ok: true, profile: tasteProfile(Feedback.forUser(req.user.id)) });
});

export default router;
