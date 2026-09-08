/**
 * Data layer. Every SQL statement in the app lives in this file so that
 * swapping SQLite for Postgres later is a single-file change.
 */
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, copyFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', '..', 'data');

/**
 * Where the database lives.
 *
 * Normally it is a file in data/. On a serverless host the project directory
 * is read-only, so we copy the committed seed database into /tmp and work
 * there instead. That makes the deployed site fully interactive -- but only
 * for as long as that container lives, because /tmp is not shared between
 * containers and is discarded when one is recycled. Writes on the deployed
 * demo are therefore real but not durable; see README "Deploying".
 */
const SEED = join(DATA, 'seed.db');
const SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (!SERVERLESS) return join(DATA, 'playstyle.db');
  const tmp = '/tmp/playstyle.db';
  if (!existsSync(tmp) && existsSync(SEED)) copyFileSync(SEED, tmp);
  return tmp;
}

export const DB_PATH = resolveDbPath();
export const IS_EPHEMERAL = SERVERLESS;

export const db = new Database(DB_PATH);

// WAL lets readers run concurrently with a writer -- the single biggest
// throughput win available to SQLite, and what makes it viable in production.
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      onboarded     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS feedback (
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id    TEXT NOT NULL,
      signal     TEXT NOT NULL CHECK (signal IN ('love','meh','played','wishlist')),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, game_id)
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_game ON feedback(game_id);

    CREATE TABLE IF NOT EXISTS reviews (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id    TEXT NOT NULL,
      verdict    TEXT NOT NULL CHECK (verdict IN ('recommend','mixed','avoid')),
      body       TEXT NOT NULL,
      hours      INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      hidden     INTEGER NOT NULL DEFAULT 0,
      UNIQUE (user_id, game_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_game ON reviews(game_id, hidden);
    CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

    CREATE TABLE IF NOT EXISTS review_votes (
      review_id  TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      helpful    INTEGER NOT NULL CHECK (helpful IN (0, 1)),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (review_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS review_reports (
      review_id  TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason     TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (review_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reports_review ON review_reports(review_id);

    -- Fandom hubs. A hub is a franchise slug from data/games.json, so there
    -- is no hubs table: membership and posts reference the slug directly.
    CREATE TABLE IF NOT EXISTS hub_members (
      franchise  TEXT NOT NULL,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (franchise, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_members_user ON hub_members(user_id);

    CREATE TABLE IF NOT EXISTS posts (
      id         TEXT PRIMARY KEY,
      franchise  TEXT NOT NULL,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      hidden     INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_posts_franchise ON posts(franchise, hidden);

    CREATE TABLE IF NOT EXISTS post_votes (
      post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id         TEXT PRIMARY KEY,
      post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      hidden     INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, hidden);
  `);
}

/* ---------------------------------- users --------------------------------- */

const q = {
  insertUser: () => db.prepare(
    `INSERT INTO users (id, email, username, password_hash, created_at, onboarded)
     VALUES (@id, @email, @username, @password_hash, @created_at, 0)`),
  userByEmail: () => db.prepare(`SELECT * FROM users WHERE email = ?`),
  userById: () => db.prepare(`SELECT * FROM users WHERE id = ?`),
  userByUsername: () => db.prepare(`SELECT * FROM users WHERE username = ?`),
  setOnboarded: () => db.prepare(`UPDATE users SET onboarded = 1 WHERE id = ?`),
  // Cascades to sessions and feedback via ON DELETE CASCADE.
  deleteUser: () => db.prepare(`DELETE FROM users WHERE id = ?`),

  insertSession: () => db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?)`),
  sessionWithUser: () => db.prepare(
    `SELECT s.expires_at, u.id, u.email, u.username, u.created_at, u.onboarded
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`),
  deleteSession: () => db.prepare(`DELETE FROM sessions WHERE token_hash = ?`),
  purgeExpired: () => db.prepare(`DELETE FROM sessions WHERE expires_at < ?`),

  upsertFeedback: () => db.prepare(
    `INSERT INTO feedback (user_id, game_id, signal, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, game_id) DO UPDATE SET signal = excluded.signal,
                                                created_at = excluded.created_at`),
  deleteFeedback: () => db.prepare(`DELETE FROM feedback WHERE user_id = ? AND game_id = ?`),
  feedbackForUser: () => db.prepare(
    `SELECT game_id, signal, created_at FROM feedback WHERE user_id = ? ORDER BY created_at DESC`),

  upsertReview: () => db.prepare(
    `INSERT INTO reviews (id, user_id, game_id, verdict, body, hours, created_at, updated_at)
     VALUES (@id, @user_id, @game_id, @verdict, @body, @hours, @created_at, @updated_at)
     ON CONFLICT(user_id, game_id) DO UPDATE SET
       verdict = excluded.verdict, body = excluded.body,
       hours = excluded.hours, updated_at = excluded.updated_at`),
  reviewsForGame: () => db.prepare(
    `SELECT r.id, r.user_id, r.game_id, r.verdict, r.body, r.hours,
            r.created_at, r.updated_at, u.username,
            COALESCE(SUM(v.helpful), 0)               AS helpful_yes,
            COALESCE(SUM(1 - v.helpful), 0)           AS helpful_no
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN review_votes v ON v.review_id = r.id
      WHERE r.game_id = ? AND r.hidden = 0
      GROUP BY r.id
      ORDER BY r.updated_at DESC`),
  reviewById: () => db.prepare(`SELECT * FROM reviews WHERE id = ?`),
  reviewCounts: () => db.prepare(
    `SELECT game_id,
            COUNT(*) AS n,
            SUM(CASE WHEN verdict = 'recommend' THEN 1 ELSE 0 END) AS yes
       FROM reviews
      WHERE hidden = 0
      GROUP BY game_id
      HAVING n >= ?
      ORDER BY n DESC`),
  reviewByUserGame: () => db.prepare(`SELECT * FROM reviews WHERE user_id = ? AND game_id = ?`),
  deleteReview: () => db.prepare(`DELETE FROM reviews WHERE id = ? AND user_id = ?`),
  myVotes: () => db.prepare(
    `SELECT review_id, helpful FROM review_votes
      WHERE user_id = ? AND review_id IN (SELECT id FROM reviews WHERE game_id = ?)`),
  upsertVote: () => db.prepare(
    `INSERT INTO review_votes (review_id, user_id, helpful, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(review_id, user_id) DO UPDATE SET
       helpful = excluded.helpful, created_at = excluded.created_at`),
  deleteVote: () => db.prepare(`DELETE FROM review_votes WHERE review_id = ? AND user_id = ?`),
  insertReport: () => db.prepare(
    `INSERT INTO review_reports (review_id, user_id, reason, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(review_id, user_id) DO NOTHING`),
  reportCount: () => db.prepare(`SELECT COUNT(*) AS n FROM review_reports WHERE review_id = ?`),
  hideReview: () => db.prepare(`UPDATE reviews SET hidden = 1 WHERE id = ?`),

  join: () => db.prepare(
    `INSERT INTO hub_members (franchise, user_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(franchise, user_id) DO NOTHING`),
  leave: () => db.prepare(`DELETE FROM hub_members WHERE franchise = ? AND user_id = ?`),
  isMember: () => db.prepare(
    `SELECT 1 AS yes FROM hub_members WHERE franchise = ? AND user_id = ?`),
  memberCounts: () => db.prepare(
    `SELECT franchise, COUNT(*) AS n FROM hub_members GROUP BY franchise`),
  myHubs: () => db.prepare(
    `SELECT franchise FROM hub_members WHERE user_id = ? ORDER BY created_at DESC`),
  postCounts: () => db.prepare(
    `SELECT franchise, COUNT(*) AS n FROM posts WHERE hidden = 0 GROUP BY franchise`),

  insertPost: () => db.prepare(
    `INSERT INTO posts (id, franchise, user_id, title, body, created_at, updated_at)
     VALUES (@id, @franchise, @user_id, @title, @body, @created_at, @updated_at)`),
  postsForHub: () => db.prepare(
    `SELECT p.id, p.user_id, p.title, p.body, p.created_at, p.updated_at, u.username,
            (SELECT COUNT(*) FROM post_votes v WHERE v.post_id = p.id)                  AS upvotes,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.hidden = 0)   AS comment_count
       FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.franchise = ? AND p.hidden = 0`),
  postById: () => db.prepare(`SELECT * FROM posts WHERE id = ?`),
  deletePost: () => db.prepare(`DELETE FROM posts WHERE id = ? AND user_id = ?`),

  votePost: () => db.prepare(
    `INSERT INTO post_votes (post_id, user_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(post_id, user_id) DO NOTHING`),
  unvotePost: () => db.prepare(`DELETE FROM post_votes WHERE post_id = ? AND user_id = ?`),
  myPostVotes: () => db.prepare(
    `SELECT post_id FROM post_votes
      WHERE user_id = ? AND post_id IN (SELECT id FROM posts WHERE franchise = ?)`),

  insertComment: () => db.prepare(
    `INSERT INTO comments (id, post_id, user_id, body, created_at)
     VALUES (@id, @post_id, @user_id, @body, @created_at)`),
  commentsForPost: () => db.prepare(
    `SELECT c.id, c.post_id, c.user_id, c.body, c.created_at, u.username
       FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ? AND c.hidden = 0
      ORDER BY c.created_at ASC`),
  commentById: () => db.prepare(`SELECT * FROM comments WHERE id = ?`),
  deleteComment: () => db.prepare(`DELETE FROM comments WHERE id = ? AND user_id = ?`),
};

// Lazily prepare-and-cache: statements can only be prepared after migrate().
const cache = new Map();
const stmt = (name) => {
  if (!cache.has(name)) cache.set(name, q[name]());
  return cache.get(name);
};

export const Users = {
  create: (row) => stmt('insertUser').run(row),
  byEmail: (email) => stmt('userByEmail').get(email),
  byId: (id) => stmt('userById').get(id),
  byUsername: (username) => stmt('userByUsername').get(username),
  markOnboarded: (id) => stmt('setOnboarded').run(id),
  destroy: (id) => stmt('deleteUser').run(id).changes,
};

export const Sessions = {
  create: (hash, userId, createdAt, expiresAt, ua) =>
    stmt('insertSession').run(hash, userId, createdAt, expiresAt, ua),
  find: (hash) => stmt('sessionWithUser').get(hash),
  destroy: (hash) => stmt('deleteSession').run(hash),
  purgeExpired: (now = Date.now()) => stmt('purgeExpired').run(now).changes,
};

export const Feedback = {
  set: (userId, gameId, signal, at = Date.now()) =>
    stmt('upsertFeedback').run(userId, gameId, signal, at),
  clear: (userId, gameId) => stmt('deleteFeedback').run(userId, gameId),
  forUser: (userId) => stmt('feedbackForUser').all(userId),

  /**
   * Feedback for many users in one query, grouped by user id. Used to score
   * reviewer-to-viewer taste similarity without an N+1 per reviewer.
   */
  forUsers(ids) {
    const grouped = new Map(ids.map((id) => [id, []]));
    if (!ids.length) return grouped;
    const holes = ids.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT user_id, game_id, signal FROM feedback WHERE user_id IN (${holes})`,
    ).all(...ids);
    for (const r of rows) grouped.get(r.user_id)?.push(r);
    return grouped;
  },
};

export const Hubs = {
  join: (franchise, userId, at = Date.now()) => stmt('join').run(franchise, userId, at),
  leave: (franchise, userId) => stmt('leave').run(franchise, userId),
  isMember: (franchise, userId) => !!stmt('isMember').get(franchise, userId),
  /** slug -> member count, for the directory. */
  memberCounts: () => new Map(stmt('memberCounts').all().map((r) => [r.franchise, r.n])),
  postCounts: () => new Map(stmt('postCounts').all().map((r) => [r.franchise, r.n])),
  mine: (userId) => stmt('myHubs').all(userId).map((r) => r.franchise),
};

export const Posts = {
  create: (row) => stmt('insertPost').run(row),
  forHub: (franchise) => stmt('postsForHub').all(franchise),
  byId: (id) => stmt('postById').get(id),
  remove: (id, userId) => stmt('deletePost').run(id, userId).changes,

  vote: (postId, userId, at = Date.now()) => stmt('votePost').run(postId, userId, at),
  unvote: (postId, userId) => stmt('unvotePost').run(postId, userId),
  myVotes: (userId, franchise) =>
    new Set(stmt('myPostVotes').all(userId, franchise).map((r) => r.post_id)),

  addComment: (row) => stmt('insertComment').run(row),
  comments: (postId) => stmt('commentsForPost').all(postId),
  commentById: (id) => stmt('commentById').get(id),
  removeComment: (id, userId) => stmt('deleteComment').run(id, userId).changes,
};

/** Reports needed before a review is auto-hidden pending moderation. */
export const REPORT_THRESHOLD = 4;

export const Reviews = {
  upsert: (row) => stmt('upsertReview').run(row),
  forGame: (gameId) => stmt('reviewsForGame').all(gameId),
  byId: (id) => stmt('reviewById').get(id),
  /** Games with at least `min` reviews, most-reviewed first. */
  counts: (min = 1) => stmt('reviewCounts').all(min),
  mine: (userId, gameId) => stmt('reviewByUserGame').get(userId, gameId),
  remove: (id, userId) => stmt('deleteReview').run(id, userId).changes,

  votesBy: (userId, gameId) => stmt('myVotes').all(userId, gameId),
  vote: (reviewId, userId, helpful, at = Date.now()) =>
    stmt('upsertVote').run(reviewId, userId, helpful ? 1 : 0, at),
  unvote: (reviewId, userId) => stmt('deleteVote').run(reviewId, userId),

  /** Returns true when the report tipped the review into hidden. */
  report(reviewId, userId, reason, at = Date.now()) {
    stmt('insertReport').run(reviewId, userId, reason, at);
    const { n } = stmt('reportCount').get(reviewId);
    if (n >= REPORT_THRESHOLD) { stmt('hideReview').run(reviewId); return true; }
    return false;
  },
};

Feedback.setMany = db.transaction((userId, entries, at) => {
  for (const { gameId, signal } of entries) {
    stmt('upsertFeedback').run(userId, gameId, signal, at);
  }
});
