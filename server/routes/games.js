import { Router } from 'express';
import { byId, publicGame, pickerGrid, stats } from '../lib/catalog.js';
import { Feedback } from '../lib/db.js';
import { gameMatch } from '../lib/recommend.js';

const router = Router();

/** The onboarding grid. Public: the taste quiz runs before signup. */
router.get('/picker', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ games: pickerGrid(42).map(publicGame), catalog: stats });
});

router.get('/:id', (req, res) => {
  const game = byId.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'not_found', message: 'No such game.' });

  const rows = req.user ? Feedback.forUser(req.user.id) : [];
  const mine = rows.find((f) => f.game_id === game.id)?.signal ?? null;
  res.json({
    game: publicGame(game),
    myFeedback: mine,
    // Same figure the recommendation feed shows, so the two never disagree.
    myMatch: rows.length ? gameMatch(rows, game) : null,
  });
});

export default router;
