/**
 * Supabase over HTTPS -- the data layer used in production.
 *
 * Why HTTPS rather than a Postgres connection: the wire protocol needs a
 * connection string, which is a secret that has to be configured on the host,
 * and getting one into the deployment proved unreliable. The REST API needs
 * only the publishable key, which is designed to be public. Combined with the
 * RLS policies in the migrations, that is the whole access-control story:
 * writes are scoped to auth.uid(), reads to what the policies allow.
 *
 * Identity is auth.users + profiles, managed by Supabase, so there is no
 * users or sessions table here.
 *
 * Two consequences worth knowing:
 *  - There are no transactions. PostgREST has no way to express one, so the
 *    seeder and the report-threshold logic are written to be safe without.
 *  - Aggregates come from the views in the migrations, because the REST API
 *    cannot GROUP BY.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { SUPABASE_URL, PUBLISHABLE_KEY } from './supabase.js';

const REST = `${SUPABASE_URL}/rest/v1`;

/**
 * The signed-in person's access token for the request being handled.
 *
 * Held in async context rather than threaded through every call, so the
 * repository API is identical to the other backends and no route had to gain
 * an extra parameter. Middleware establishes it; unset means act as the
 * anonymous role, which RLS restricts to public reads.
 */
export const authContext = new AsyncLocalStorage();
const token = () => authContext.getStore()?.accessToken ?? null;

async function rest(path, { method = 'GET', body, prefer, single = false } = {}) {
  const jwt = token();
  const headers = {
    apikey: PUBLISHABLE_KEY,
    Authorization: `Bearer ${jwt ?? PUBLISHABLE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${REST}/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }

  if (!res.ok) {
    const detail = data?.message || data?.hint || String(data ?? '').slice(0, 200);
    const err = new Error(`supabase ${method} ${path.split('?')[0]}: ${detail}`);
    err.status = res.status;
    err.pgCode = data?.code;
    throw err;
  }
  if (single) return Array.isArray(data) ? data[0] ?? undefined : data ?? undefined;
  return data ?? [];
}

/* ------------------------------ row mapping ------------------------------- */

const ms = (iso) => (iso ? Date.parse(iso) : null);
const iso = (millis) => new Date(millis ?? Date.now()).toISOString();

// Timestamps are timestamptz in the database and epoch milliseconds
// everywhere in the application, so every read converts.
const mapFeedback = (r) => ({ game_id: r.game_id, signal: r.signal, created_at: ms(r.created_at) });

/*
 * PostgREST decides between an object and a single-element array for an
 * embedded resource depending on how it infers cardinality, and it returns
 * review_vote_stats as an array. Reading it as an object silently produced a
 * tally of zero for every review even after votes were cast.
 */
const embedded = (value) => (Array.isArray(value) ? value[0] : value) ?? null;

const mapReview = (r) => ({
  id: r.id,
  user_id: r.user_id,
  game_id: r.game_id,
  verdict: r.verdict,
  body: r.body,
  hours: r.hours,
  created_at: ms(r.created_at),
  updated_at: ms(r.updated_at),
  hidden: r.hidden,
  username: embedded(r.profiles)?.username ?? null,
  helpful_yes: embedded(r.review_vote_stats)?.helpful_yes ?? 0,
  helpful_no: embedded(r.review_vote_stats)?.helpful_no ?? 0,
});

const mapPost = (r) => ({
  id: r.id,
  user_id: r.user_id,
  title: r.title,
  body: r.body,
  franchise: r.franchise,
  created_at: ms(r.created_at),
  updated_at: ms(r.updated_at),
  username: embedded(r.profiles)?.username ?? null,
  upvotes: embedded(r.post_votes)?.count ?? 0,
  comment_count: embedded(r.comments)?.count ?? 0,
});

const mapComment = (r) => ({
  id: r.id,
  post_id: r.post_id,
  user_id: r.user_id,
  body: r.body,
  created_at: ms(r.created_at),
  username: embedded(r.profiles)?.username ?? null,
});

const mapProfile = (r) => r && ({
  id: r.id,
  email: r.email,
  username: r.username,
  onboarded: r.onboarded,
  created_at: ms(r.created_at),
  // Credentials live in Supabase Auth, so there is no local hash to compare.
  password_hash: 'supabase-auth:external',
});

/* --------------------------------- lifecycle ------------------------------ */

/** Confirm the schema is reachable, rather than failing mid-request later. */
export async function migrate() {
  await rest('profiles?select=id&limit=1');
}

/**
 * PostgREST has no transactions. Callers use this only for the demo seed and
 * the report threshold, both of which are written to be idempotent, so
 * running the body directly is safe -- but it is not atomic and should not be
 * relied on as though it were.
 */
export async function withTransaction(fn) { return fn(); }

/* ---------------------------------- users --------------------------------- */
/* Backed by profiles. Rows are created by the on_auth_user_created trigger
 * when someone registers, so there is no create() here. */

export const Users = {
  byId: async (id) => mapProfile(await rest(`profiles?id=eq.${id}&select=*`, { single: true })),
  byEmail: async (email) => mapProfile(
    await rest(`profiles?email=eq.${encodeURIComponent(email)}&select=*`, { single: true })),
  byUsername: async (username) => mapProfile(
    await rest(`profiles?username=eq.${encodeURIComponent(username)}&select=*`, { single: true })),
  markOnboarded: (id) => rest(`profiles?id=eq.${id}`, { method: 'PATCH', body: { onboarded: true } }),
  count: async () => {
    const rows = await rest('profiles?select=id');
    return rows.length;
  },
  // Registration and account deletion belong to Supabase Auth.
  create: async () => { throw new Error('accounts are created through Supabase Auth'); },
  destroy: async () => { throw new Error('accounts are deleted through Supabase Auth'); },
};

/* -------------------------------- feedback -------------------------------- */

export const Feedback = {
  forUser: async (userId) => (await rest(
    `feedback?user_id=eq.${userId}&select=game_id,signal,created_at&order=created_at.desc`))
    .map(mapFeedback),

  set: (userId, gameId, signal, at = Date.now()) => rest('feedback', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: { user_id: userId, game_id: gameId, signal, created_at: iso(at) },
  }),

  clear: (userId, gameId) => rest(
    `feedback?user_id=eq.${userId}&game_id=eq.${encodeURIComponent(gameId)}`, { method: 'DELETE' }),

  setMany: (userId, entries, at = Date.now()) => (entries.length
    ? rest('feedback', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: entries.map((e) => ({
          user_id: userId, game_id: e.gameId, signal: e.signal, created_at: iso(at),
        })),
      })
    : Promise.resolve(null)),

  /** Ratings for many people at once, for reviewer-to-viewer taste matching. */
  async forUsers(ids) {
    const grouped = new Map(ids.map((id) => [id, []]));
    if (!ids.length) return grouped;
    const rows = await rest(
      `feedback?user_id=in.(${ids.join(',')})&select=user_id,game_id,signal,created_at`);
    for (const r of rows) grouped.get(r.user_id)?.push(mapFeedback(r));
    return grouped;
  },
};

/* --------------------------------- reviews -------------------------------- */

export const REPORT_THRESHOLD = 4;

const REVIEW_SELECT =
  '*,profiles!reviews_user_id_fkey(username),review_vote_stats(helpful_yes,helpful_no)';


export const Reviews = {
  forGame: async (gameId) => (await rest(
    `reviews?game_id=eq.${encodeURIComponent(gameId)}&hidden=eq.false`
    + `&select=${REVIEW_SELECT}&order=updated_at.desc`)).map(mapReview),

  byId: async (id) => {
    const row = await rest(`reviews?id=eq.${id}&select=${REVIEW_SELECT}`, { single: true });
    return row ? mapReview(row) : undefined;
  },

  mine: async (userId, gameId) => {
    const row = await rest(
      `reviews?user_id=eq.${userId}&game_id=eq.${encodeURIComponent(gameId)}&select=${REVIEW_SELECT}`,
      { single: true });
    return row ? mapReview(row) : undefined;
  },

  upsert: (row) => rest('reviews', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: {
      id: row.id,
      user_id: row.user_id,
      game_id: row.game_id,
      verdict: row.verdict,
      body: row.body,
      hours: row.hours,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
    },
  }),

  remove: async (id, userId) => {
    await rest(`reviews?id=eq.${id}&user_id=eq.${userId}`, { method: 'DELETE' });
    return 1;
  },

  /** From the review_stats view: the REST API cannot GROUP BY. */
  counts: async (min = 1) => (await rest('review_stats?select=game_id,n,yes&order=n.desc'))
    .filter((r) => r.n >= min),

  votesBy: async (userId, gameId) => {
    const reviews = await rest(
      `reviews?game_id=eq.${encodeURIComponent(gameId)}&select=id`);
    if (!reviews.length) return [];
    const ids = reviews.map((r) => r.id).join(',');
    const votes = await rest(
      `review_votes?user_id=eq.${userId}&review_id=in.(${ids})&select=review_id,helpful`);
    // 0/1 rather than a boolean, matching what the routes already compare.
    return votes.map((v) => ({ review_id: v.review_id, helpful: v.helpful ? 1 : 0 }));
  },

  vote: (reviewId, userId, helpful, at = Date.now()) => rest('review_votes', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: { review_id: reviewId, user_id: userId, helpful: !!helpful, created_at: iso(at) },
  }),

  unvote: (reviewId, userId) => rest(
    `review_votes?review_id=eq.${reviewId}&user_id=eq.${userId}`, { method: 'DELETE' }),

  /**
   * File a report and hide the review once enough have accumulated.
   * Not atomic -- see withTransaction -- but the insert is idempotent on
   * (review_id, user_id) and hiding twice is harmless.
   */
  async report(reviewId, userId, reason, at = Date.now()) {
    await rest('review_reports', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: { review_id: reviewId, user_id: userId, reason, created_at: iso(at) },
    });
    const stats = await rest(`report_stats?review_id=eq.${reviewId}&select=reports`, { single: true });
    if ((stats?.reports ?? 0) >= REPORT_THRESHOLD) {
      await rest(`reviews?id=eq.${reviewId}`, { method: 'PATCH', body: { hidden: true } });
      return true;
    }
    return false;
  },
};

/* ---------------------------------- hubs ---------------------------------- */

export const Hubs = {
  join: (franchise, userId, at = Date.now()) => rest('hub_members', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: { franchise, user_id: userId, created_at: iso(at) },
  }),

  leave: (franchise, userId) => rest(
    `hub_members?franchise=eq.${encodeURIComponent(franchise)}&user_id=eq.${userId}`,
    { method: 'DELETE' }),

  isMember: async (franchise, userId) => !!await rest(
    `hub_members?franchise=eq.${encodeURIComponent(franchise)}&user_id=eq.${userId}&select=user_id`,
    { single: true }),

  memberCounts: async () => new Map(
    (await rest('hub_stats?select=franchise,members')).map((r) => [r.franchise, r.members])),

  postCounts: async () => new Map(
    (await rest('hub_stats?select=franchise,posts')).map((r) => [r.franchise, r.posts])),

  mine: async (userId) => (await rest(
    `hub_members?user_id=eq.${userId}&select=franchise&order=created_at.desc`))
    .map((r) => r.franchise),

  joinMany: (rows) => (rows.length
    ? rest('hub_members', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: rows.map((r) => ({
          franchise: r.franchise, user_id: r.user_id, created_at: iso(r.created_at),
        })),
      })
    : Promise.resolve(null)),
};

/* ---------------------------------- posts --------------------------------- */

/*
 * Counts come from aggregate embeds on the real child tables rather than the
 * post_stats view: PostgREST can only embed a view when it can infer a
 * relationship, and that view keys on posts.id, which is a primary key, not a
 * foreign key. post_votes.post_id and comments.post_id are both real foreign
 * keys, so these resolve.
 */
const POST_SELECT = '*,profiles!posts_user_id_fkey(username),post_votes(count),comments(count)';
const POST_FILTER = 'comments.hidden=eq.false';

export const Posts = {
  forHub: async (franchise) => (await rest(
    `posts?franchise=eq.${encodeURIComponent(franchise)}&hidden=eq.false`
    + `&select=${POST_SELECT}&${POST_FILTER}`)).map(mapPost),

  byId: async (id) => {
    const row = await rest(`posts?id=eq.${id}&select=${POST_SELECT}&${POST_FILTER}`, { single: true });
    return row ? mapPost(row) : undefined;
  },

  create: (row) => rest('posts', {
    method: 'POST',
    body: {
      id: row.id, franchise: row.franchise, user_id: row.user_id,
      title: row.title, body: row.body,
      created_at: iso(row.created_at), updated_at: iso(row.updated_at),
    },
  }),

  remove: async (id, userId) => {
    await rest(`posts?id=eq.${id}&user_id=eq.${userId}`, { method: 'DELETE' });
    return 1;
  },

  vote: (postId, userId, at = Date.now()) => rest('post_votes', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: { post_id: postId, user_id: userId, created_at: iso(at) },
  }),

  unvote: (postId, userId) => rest(
    `post_votes?post_id=eq.${postId}&user_id=eq.${userId}`, { method: 'DELETE' }),

  myVotes: async (userId, franchise) => {
    const posts = await rest(
      `posts?franchise=eq.${encodeURIComponent(franchise)}&select=id`);
    if (!posts.length) return new Set();
    const ids = posts.map((p) => p.id).join(',');
    const votes = await rest(`post_votes?user_id=eq.${userId}&post_id=in.(${ids})&select=post_id`);
    return new Set(votes.map((v) => v.post_id));
  },

  addComment: (row) => rest('comments', {
    method: 'POST',
    body: {
      id: row.id, post_id: row.post_id, user_id: row.user_id,
      body: row.body, created_at: iso(row.created_at),
    },
  }),

  comments: async (postId) => (await rest(
    `comments?post_id=eq.${postId}&hidden=eq.false`
    + `&select=*,profiles!comments_user_id_fkey(username)&order=created_at.asc`))
    .map(mapComment),

  commentById: async (id) => {
    const row = await rest(`comments?id=eq.${id}&select=*`, { single: true });
    return row ? mapComment(row) : undefined;
  },

  removeComment: async (id, userId) => {
    await rest(`comments?id=eq.${id}&user_id=eq.${userId}`, { method: 'DELETE' });
    return 1;
  },

  createMany: (rows) => (rows.length ? rest('posts', {
    method: 'POST', prefer: 'resolution=merge-duplicates',
    body: rows.map((r) => ({
      id: r.id, franchise: r.franchise, user_id: r.user_id, title: r.title, body: r.body,
      created_at: iso(r.created_at), updated_at: iso(r.updated_at),
    })),
  }) : Promise.resolve(null)),

  addCommentMany: (rows) => (rows.length ? rest('comments', {
    method: 'POST', prefer: 'resolution=merge-duplicates',
    body: rows.map((r) => ({
      id: r.id, post_id: r.post_id, user_id: r.user_id, body: r.body, created_at: iso(r.created_at),
    })),
  }) : Promise.resolve(null)),

  voteMany: (rows) => (rows.length ? rest('post_votes', {
    method: 'POST', prefer: 'resolution=merge-duplicates',
    body: rows.map((r) => ({ post_id: r.post_id, user_id: r.user_id, created_at: iso(r.created_at) })),
  }) : Promise.resolve(null)),
};

Reviews.upsertMany = (rows) => (rows.length ? rest('reviews', {
  method: 'POST', prefer: 'resolution=merge-duplicates',
  body: rows.map((r) => ({
    id: r.id, user_id: r.user_id, game_id: r.game_id, verdict: r.verdict,
    body: r.body, hours: r.hours,
    created_at: iso(r.created_at), updated_at: iso(r.updated_at),
  })),
}) : Promise.resolve(null));

Users.createMany = async () => { throw new Error('accounts are created through Supabase Auth'); };

/** No local sessions table: the session cookie carries the Supabase tokens. */
export const Sessions = {
  create: async () => null,
  find: async () => undefined,
  destroy: async () => null,
  purgeExpired: async () => 0,
};

export const BACKEND = 'supabase';
export const DB_PATH = '(supabase rest)';
export const IS_EPHEMERAL = false;
