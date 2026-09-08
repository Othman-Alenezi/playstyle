import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { Hubs, Posts, Feedback } from '../lib/db.js';
import { hubs, hubList, hubBrief, hubsForGames, hotScore } from '../lib/hubs.js';
import { tasteSummary, matchBetween } from '../lib/recommend.js';
import { requireAuth, rateLimit } from '../middleware.js';

const router = Router();

const TITLE_MIN = 4;
const TITLE_MAX = 140;
const POST_MIN = 20;
const POST_MAX = 8000;
const COMMENT_MIN = 2;
const COMMENT_MAX = 2000;

const clean = (v) => String(v ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

const writeLimit = rateLimit({
  windowMs: 60 * 60e3, max: 40,
  key: (req) => req.user?.id ?? req.ip,
  message: 'You have posted a lot in the last hour. Give it a few minutes.',
});

/**
 * Hub directory. Hubs tied to games the viewer already likes come first --
 * a wall of 134 franchises they have no connection to is not a community,
 * and empty hubs are what kill this kind of feature.
 */
router.get('/hubs', (req, res) => {
  const members = Hubs.memberCounts();
  const posts = Hubs.postCounts();
  const decorate = (hub) => ({
    ...hubBrief(hub),
    memberCount: members.get(hub.slug) ?? 0,
    postCount: posts.get(hub.slug) ?? 0,
  });

  let mine = [];
  if (req.user) {
    const rows = Feedback.forUser(req.user.id);
    const liked = rows.filter((r) => r.signal !== 'meh').map((r) => r.game_id);
    const joined = new Set(Hubs.mine(req.user.id));
    const relevant = new Map(hubsForGames(liked).map((h) => [h.slug, h]));
    for (const slug of joined) if (hubs.has(slug)) relevant.set(slug, hubs.get(slug));
    mine = [...relevant.values()].map((h) => ({ ...decorate(h), joined: joined.has(h.slug) }));
    mine.sort((a, b) => Number(b.joined) - Number(a.joined) || b.postCount - a.postCount);
  }

  const mineSlugs = new Set(mine.map((h) => h.slug));
  const active = hubList
    .filter((h) => (posts.get(h.slug) ?? 0) > 0 && !mineSlugs.has(h.slug))
    .map(decorate)
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, 12);
  const browse = hubList
    .filter((h) => !mineSlugs.has(h.slug) && !active.some((a) => a.slug === h.slug))
    .map(decorate)
    .slice(0, 24);

  res.json({ mine, active, browse, total: hubList.length });
});

/** One hub: its games, its posts, and who is in it. */
router.get('/hubs/:slug', (req, res) => {
  const hub = hubs.get(req.params.slug);
  if (!hub) return res.status(404).json({ error: 'not_found', message: 'No such fandom.' });

  const rows = Posts.forHub(hub.slug);
  const viewerRows = req.user ? Feedback.forUser(req.user.id) : null;
  const tasteByUser = Feedback.forUsers([...new Set(rows.map((r) => r.user_id))]);
  const myVotes = req.user ? Posts.myVotes(req.user.id, hub.slug) : new Set();

  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    upvotes: r.upvotes,
    commentCount: r.comment_count,
    myVote: myVotes.has(r.id),
    author: {
      username: r.username,
      isMe: req.user?.id === r.user_id,
      // Same taste chip as on reviews: you can see whether the person
      // arguing about balance actually plays this kind of game.
      taste: tasteSummary(tasteByUser.get(r.user_id) ?? []),
    },
    tasteMatch: viewerRows?.length ? matchBetween(viewerRows, tasteByUser.get(r.user_id) ?? []) : null,
  }));

  const sort = ['hot', 'new', 'top'].includes(req.query.sort) ? req.query.sort : 'hot';
  const now = Date.now();
  const order = {
    hot: (a, b) => hotScore({ upvotes: b.upvotes, createdAt: b.createdAt }, now)
                 - hotScore({ upvotes: a.upvotes, createdAt: a.createdAt }, now),
    new: (a, b) => b.createdAt - a.createdAt,
    top: (a, b) => b.upvotes - a.upvotes || b.createdAt - a.createdAt,
  }[sort];
  items.sort(order);

  res.json({
    hub: { slug: hub.slug, name: hub.name, tags: hub.tags, games: hub.games },
    posts: items,
    sort,
    memberCount: Hubs.memberCounts().get(hub.slug) ?? 0,
    joined: req.user ? Hubs.isMember(hub.slug, req.user.id) : false,
  });
});

router.post('/hubs/:slug/join', requireAuth, (req, res) => {
  if (!hubs.has(req.params.slug)) return res.status(404).json({ error: 'not_found', message: 'No such fandom.' });
  const leaving = req.body?.leave === true;
  if (leaving) Hubs.leave(req.params.slug, req.user.id);
  else Hubs.join(req.params.slug, req.user.id);
  res.json({
    ok: true,
    joined: !leaving,
    memberCount: Hubs.memberCounts().get(req.params.slug) ?? 0,
  });
});

router.post('/hubs/:slug/posts', requireAuth, writeLimit, (req, res) => {
  if (!hubs.has(req.params.slug)) return res.status(404).json({ error: 'not_found', message: 'No such fandom.' });

  const title = clean(req.body?.title);
  const body = clean(req.body?.body);
  const errors = {};
  if (title.length < TITLE_MIN) errors.title = `At least ${TITLE_MIN} characters.`;
  else if (title.length > TITLE_MAX) errors.title = `Under ${TITLE_MAX} characters.`;
  if (body.length < POST_MIN) errors.body = `At least ${POST_MIN} characters.`;
  else if (body.length > POST_MAX) errors.body = `Under ${POST_MAX} characters.`;
  if (Object.keys(errors).length) return res.status(400).json({ error: 'invalid', fields: errors });

  const now = Date.now();
  const id = randomUUID();
  Posts.create({ id, franchise: req.params.slug, user_id: req.user.id, title, body, created_at: now, updated_at: now });
  // Posting in a hub joins it: opting in by participating is less friction
  // than asking someone to press Join first.
  Hubs.join(req.params.slug, req.user.id, now);
  res.status(201).json({ ok: true, id });
});

router.delete('/posts/:id', requireAuth, (req, res) => {
  const post = Posts.byId(req.params.id);
  if (!post) return res.status(404).json({ error: 'not_found', message: 'No such post.' });
  if (!Posts.remove(post.id, req.user.id)) {
    return res.status(403).json({ error: 'not_yours', message: 'That is not your post.' });
  }
  res.json({ ok: true });
});

router.post('/posts/:id/vote', requireAuth, (req, res) => {
  const post = Posts.byId(req.params.id);
  if (!post) return res.status(404).json({ error: 'not_found', message: 'No such post.' });
  if (post.user_id === req.user.id) {
    return res.status(400).json({ error: 'own_post', message: "You can't upvote your own post." });
  }
  if (req.body?.up === false) Posts.unvote(post.id, req.user.id);
  else Posts.vote(post.id, req.user.id);
  res.json({ ok: true });
});

router.get('/posts/:id/comments', (req, res) => {
  const post = Posts.byId(req.params.id);
  if (!post) return res.status(404).json({ error: 'not_found', message: 'No such post.' });

  const rows = Posts.comments(post.id);
  const viewerRows = req.user ? Feedback.forUser(req.user.id) : null;
  const tasteByUser = Feedback.forUsers([...new Set(rows.map((r) => r.user_id))]);

  res.json({
    items: rows.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      author: {
        username: c.username,
        isMe: req.user?.id === c.user_id,
        taste: tasteSummary(tasteByUser.get(c.user_id) ?? [], { games: 2, tags: 2 }),
      },
      tasteMatch: viewerRows?.length ? matchBetween(viewerRows, tasteByUser.get(c.user_id) ?? []) : null,
    })),
  });
});

router.post('/posts/:id/comments', requireAuth, writeLimit, (req, res) => {
  const post = Posts.byId(req.params.id);
  if (!post) return res.status(404).json({ error: 'not_found', message: 'No such post.' });

  const body = clean(req.body?.body);
  if (body.length < COMMENT_MIN) return res.status(400).json({ error: 'invalid', fields: { body: 'Say something.' } });
  if (body.length > COMMENT_MAX) return res.status(400).json({ error: 'invalid', fields: { body: `Under ${COMMENT_MAX} characters.` } });

  Posts.addComment({ id: randomUUID(), post_id: post.id, user_id: req.user.id, body, created_at: Date.now() });
  Hubs.join(post.franchise, req.user.id);
  res.status(201).json({ ok: true });
});

router.delete('/comments/:id', requireAuth, (req, res) => {
  const comment = Posts.commentById(req.params.id);
  if (!comment) return res.status(404).json({ error: 'not_found', message: 'No such comment.' });
  if (!Posts.removeComment(comment.id, req.user.id)) {
    return res.status(403).json({ error: 'not_yours', message: 'That is not your comment.' });
  }
  res.json({ ok: true });
});

export default router;
