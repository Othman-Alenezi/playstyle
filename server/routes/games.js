import { Router } from 'express';
import { games as allGames, byId, publicGame, pickerGrid, stats } from '../lib/catalog.js';
import { Feedback, Reviews } from '../lib/db.js';
import { gameMatch, similarTo } from '../lib/recommend.js';

const router = Router();

const SORTS = {
  reviews: (a, b) => b.reviewCount - a.reviewCount || b.pop - a.pop,
  popular: (a, b) => b.pop - a.pop,
  rating: (a, b) => b.rating - a.rating,
  newest: (a, b) => b.year - a.year,
  title: (a, b) => a.title.localeCompare(b.title),
};

/**
 * Browse the catalog: search, filter by genre, sort. Exists because a game
 * page had no route to any other game -- the only ways in were the taste quiz
 * and your own recommendations, so reading one game's reviews was a dead end.
 */
router.get('/', async (req, res, next) => {
  try {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const genre = String(req.query.genre ?? '').trim();
  const sort = SORTS[req.query.sort] ? req.query.sort : 'reviews';
  const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const counts = new Map((await Reviews.counts(1)).map((r) => [r.game_id, r.n]));

  let list = allGames.map((g) => ({ ...publicGame(g), pop: g.pop, reviewCount: counts.get(g.id) ?? 0 }));
  if (genre) list = list.filter((g) => g.genres.includes(genre));
  if (q) {
    list = list.filter((g) =>
      g.title.toLowerCase().includes(q) || g.tags.some((t) => t.includes(q)));
  }
  list.sort(SORTS[sort]);

  const page = list.slice(offset, offset + limit).map(({ pop, ...rest }) => rest);
  res.json({
    items: page,
    total: list.length,
    offset,
    limit,
    sort,
    genres: [...new Set(allGames.flatMap((g) => g.genres))].sort(),
    catalog: stats,
  });
  } catch (err) { next(err); }
});

/** Games like this one, so a game page can lead somewhere. */
router.get('/:id/similar', async (req, res, next) => {
  try {
  const game = byId.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'not_found', message: 'No such game.' });
  const counts = new Map((await Reviews.counts(1)).map((r) => [r.game_id, r.n]));
  const items = similarTo(game, { limit: Number(req.query.limit) || 6 })
    .map((g) => ({ ...g, reviewCount: counts.get(g.id) ?? 0 }));
  res.json({ items });
  } catch (err) { next(err); }
});

/** The onboarding grid. Public: the taste quiz runs before signup. */
router.get('/picker', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ games: pickerGrid(42).map(publicGame), catalog: stats });
});

router.get('/:id', async (req, res, next) => {
  try {
  const game = byId.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'not_found', message: 'No such game.' });

  const rows = req.user ? await Feedback.forUser(req.user.id) : [];
  const mine = rows.find((f) => f.game_id === game.id)?.signal ?? null;
  res.json({
    game: publicGame(game),
    myFeedback: mine,
    // Same figure the recommendation feed shows, so the two never disagree.
    myMatch: rows.length ? gameMatch(rows, game) : null,
  });
  } catch (err) { next(err); }
});

export default router;
