import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { Feedback, Reviews, REPORT_THRESHOLD } from '../lib/db.js';
import { byId } from '../lib/catalog.js';
import { matchBetween, tasteSummary, verdictSplit } from '../lib/recommend.js';
import { requireAuth, rateLimit } from '../middleware.js';
import { validateReview, REPORT_REASONS } from '../lib/validate-review.js';

const router = Router();

const writeLimit = rateLimit({
  windowMs: 60 * 60e3, max: 20,
  key: (req) => req.user?.id ?? req.ip,
  message: 'You have posted a lot of reviews in the last hour. Try again later.',
});

const SORTS = {
  match: (a, b) => (b.tasteMatch ?? -1) - (a.tasteMatch ?? -1) || b.updatedAt - a.updatedAt,
  helpful: (a, b) => b.helpfulYes - a.helpfulYes || (b.tasteMatch ?? -1) - (a.tasteMatch ?? -1),
  new: (a, b) => b.updatedAt - a.updatedAt,
};

/**
 * Reviews for one game, each annotated with how closely that reviewer's taste
 * matches the viewer's. Signed-out visitors get the reviews without matches --
 * the match number is the reason to have an account.
 */
router.get('/games/:id/reviews', (req, res) => {
  const game = byId.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'not_found', message: 'No such game.' });

  const rows = Reviews.forGame(game.id);
  const viewerRows = req.user ? Feedback.forUser(req.user.id) : null;

  // One query for every reviewer's ratings rather than one per reviewer.
  const tasteByUser = Feedback.forUsers([...new Set(rows.map((r) => r.user_id))]);
  const myVotes = req.user
    ? new Map(Reviews.votesBy(req.user.id, game.id).map((v) => [v.review_id, v.helpful === 1]))
    : new Map();

  const items = rows.map((r) => {
    const theirRows = tasteByUser.get(r.user_id) ?? [];
    return {
      id: r.id,
      verdict: r.verdict,
      body: r.body,
      hours: r.hours,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      edited: r.updated_at - r.created_at > 60e3,
      author: {
        username: r.username,
        isMe: req.user?.id === r.user_id,
        taste: tasteSummary(theirRows),
      },
      tasteMatch: viewerRows?.length ? matchBetween(viewerRows, theirRows) : null,
      helpfulYes: r.helpful_yes,
      helpfulNo: r.helpful_no,
      myVote: myVotes.has(r.id) ? (myVotes.get(r.id) ? 'yes' : 'no') : null,
    };
  });

  const sort = SORTS[req.query.sort] ? req.query.sort : (viewerRows?.length ? 'match' : 'helpful');
  items.sort(SORTS[sort]);

  res.json({
    items,
    sort,
    // Your own review is excluded from the aggregate: you match yourself 100%,
    // so counting it would inflate "players like you" with your own opinion.
    split: verdictSplit(items.filter((i) => !i.author.isMe)),
    myReview: req.user ? items.find((i) => i.author.isMe)?.id ?? null : null,
  });
});

router.post('/games/:id/reviews', requireAuth, writeLimit, (req, res) => {
  const game = byId.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'not_found', message: 'No such game.' });

  const { errors, value } = validateReview(req.body ?? {});
  if (Object.keys(errors).length) return res.status(400).json({ error: 'invalid', fields: errors });

  const existing = Reviews.mine(req.user.id, game.id);
  const now = Date.now();
  Reviews.upsert({
    id: existing?.id ?? randomUUID(),
    user_id: req.user.id,
    game_id: game.id,
    verdict: value.verdict,
    body: value.body,
    hours: value.hours,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
  res.status(existing ? 200 : 201).json({ ok: true, updated: !!existing });
});

router.delete('/games/:id/reviews', requireAuth, (req, res) => {
  const existing = Reviews.mine(req.user.id, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found', message: 'You have no review here.' });
  Reviews.remove(existing.id, req.user.id);
  res.json({ ok: true });
});

router.post('/reviews/:id/vote', requireAuth, (req, res) => {
  const review = Reviews.byId(req.params.id);
  if (!review) return res.status(404).json({ error: 'not_found', message: 'No such review.' });
  if (review.user_id === req.user.id) {
    return res.status(400).json({ error: 'own_review', message: "You can't vote on your own review." });
  }
  const { helpful } = req.body ?? {};
  // null clears the vote, so the button can toggle off.
  if (helpful === null) Reviews.unvote(review.id, req.user.id);
  else if (typeof helpful === 'boolean') Reviews.vote(review.id, req.user.id, helpful);
  else return res.status(400).json({ error: 'bad_vote', message: 'helpful must be true, false or null.' });
  res.json({ ok: true });
});

router.post('/reviews/:id/report', requireAuth, (req, res) => {
  const review = Reviews.byId(req.params.id);
  if (!review) return res.status(404).json({ error: 'not_found', message: 'No such review.' });
  const reason = String(req.body?.reason ?? '');
  if (!REPORT_REASONS.includes(reason)) {
    return res.status(400).json({ error: 'bad_reason', message: `reason must be one of ${REPORT_REASONS.join(', ')}` });
  }
  const hidden = Reviews.report(review.id, req.user.id, reason);
  res.json({ ok: true, hidden, threshold: REPORT_THRESHOLD });
});

export default router;
