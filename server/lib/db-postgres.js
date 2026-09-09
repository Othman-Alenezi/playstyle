/**
 * Postgres implementation of the data layer, used when DATABASE_URL is set.
 *
 * Kept deliberately parallel to db-sqlite.js: same object names, same method
 * names, same return shapes. Where the two dialects disagree the difference
 * is absorbed here so no route ever has to know which backend is live.
 *
 * Normalisations worth knowing about:
 *  - int8/bigint comes back from pg as a string. Parsed to Number globally,
 *    otherwise every created_at and every COUNT would be a string.
 *  - booleans are returned as 0/1 where SQLite returned integers, so callers
 *    comparing `=== 1` keep working.
 */
import pg from 'pg';

// bigint (oid 20) as Number: timestamps here are epoch milliseconds, well
// inside the safe integer range, and COUNT(*) must not be a string.
pg.types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

const connectionString = process.env.DATABASE_URL;

/**
 * One pool per process, reused across serverless invocations. A small max
 * matters on a serverless host: many containers each holding a pool will
 * exhaust the database's connection limit.
 */
export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.PGPOOL_MAX) || 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  // Supabase terminates TLS with its own chain; the pooler needs SSL on.
  ssl: /supabase|amazonaws|neon|render/.test(connectionString ?? '')
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on('error', (err) => console.error('[pg] idle client error', err.message));

const all = async (sql, params = []) => (await pool.query(sql, params)).rows;
const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0] ?? undefined;
const run = async (sql, params = []) => (await pool.query(sql, params)).rowCount;

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The schema is created by a Supabase migration rather than at boot, so this
 * only verifies the tables are actually there -- a much better failure than
 * the first query dying mid-request.
 */
export async function migrate() {
  const { rows } = await pool.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name = any($1::text[])`,
    [['users', 'sessions', 'feedback', 'reviews', 'posts', 'comments',
      'post_votes', 'hub_members', 'review_votes', 'review_reports']],
  );
  const found = new Set(rows.map((r) => r.table_name));
  const missing = ['users', 'sessions', 'feedback', 'reviews', 'posts', 'comments',
    'post_votes', 'hub_members', 'review_votes', 'review_reports']
    .filter((t) => !found.has(t));
  if (missing.length) {
    throw new Error(`Postgres is missing tables: ${missing.join(', ')}. `
      + 'Apply the schema migration before starting the app.');
  }
}

/* --------------------------------- users --------------------------------- */

export const Users = {
  create: (row) => run(
    `insert into users (id, email, username, password_hash, created_at, onboarded)
     values ($1, $2, $3, $4, $5, false)`,
    [row.id, row.email, row.username, row.password_hash, row.created_at],
  ),
  byEmail: (email) => one(`select * from users where email = $1`, [email]),
  byId: (id) => one(`select * from users where id = $1`, [id]),
  byUsername: (username) => one(`select * from users where username = $1`, [username]),
  markOnboarded: (id) => run(`update users set onboarded = true where id = $1`, [id]),
  destroy: (id) => run(`delete from users where id = $1`, [id]),
  count: async () => (await one(`select count(*) as n from users`)).n,
};

export const Sessions = {
  create: (hash, userId, createdAt, expiresAt, ua) => run(
    `insert into sessions (token_hash, user_id, created_at, expires_at, user_agent)
     values ($1, $2, $3, $4, $5)
     on conflict (token_hash) do nothing`,
    [hash, userId, createdAt, expiresAt, ua],
  ),
  find: (hash) => one(
    `select s.expires_at, u.id, u.email, u.username, u.created_at, u.onboarded
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1`,
    [hash],
  ),
  destroy: (hash) => run(`delete from sessions where token_hash = $1`, [hash]),
  purgeExpired: (now = Date.now()) => run(`delete from sessions where expires_at < $1`, [now]),
};

/* -------------------------------- feedback -------------------------------- */

export const Feedback = {
  set: (userId, gameId, signal, at = Date.now()) => run(
    `insert into feedback (user_id, game_id, signal, created_at)
     values ($1, $2, $3, $4)
     on conflict (user_id, game_id)
       do update set signal = excluded.signal, created_at = excluded.created_at`,
    [userId, gameId, signal, at],
  ),
  clear: (userId, gameId) => run(
    `delete from feedback where user_id = $1 and game_id = $2`, [userId, gameId]),
  forUser: (userId) => all(
    `select game_id, signal, created_at from feedback
      where user_id = $1 order by created_at desc`, [userId]),

  /** One query for many users, grouped -- avoids an N+1 per reviewer. */
  async forUsers(ids) {
    const grouped = new Map(ids.map((id) => [id, []]));
    if (!ids.length) return grouped;
    const rows = await all(
      `select user_id, game_id, signal from feedback where user_id = any($1::uuid[])`,
      [ids],
    );
    for (const r of rows) grouped.get(r.user_id)?.push(r);
    return grouped;
  },

  /** Multi-row upsert in one statement rather than one round trip each. */
  async setMany(userId, entries, at = Date.now()) {
    if (!entries.length) return 0;
    const values = entries.map((_, i) =>
      `($1, $${i * 2 + 2}, $${i * 2 + 3}, $${entries.length * 2 + 2})`).join(', ');
    const params = [userId, ...entries.flatMap((e) => [e.gameId, e.signal]), at];
    return run(
      `insert into feedback (user_id, game_id, signal, created_at)
       values ${values}
       on conflict (user_id, game_id)
         do update set signal = excluded.signal, created_at = excluded.created_at`,
      params,
    );
  },
};

/**
 * Bulk inserts, used by the demo seeder.
 *
 * Seeding row-by-row is fine against a local file but not across a network:
 * ~2400 round trips would blow a serverless request's time limit on the first
 * boot against an empty database. One statement per table instead.
 */
const bulk = async (table, cols, rows, toParams, conflict = 'do nothing') => {
  if (!rows.length) return 0;
  const width = cols.length;
  const values = rows.map((_, r) =>
    `(${cols.map((__, c) => `$${r * width + c + 1}`).join(', ')})`).join(',\n');
  const params = rows.flatMap(toParams);
  return run(
    `insert into ${table} (${cols.join(', ')}) values\n${values}\non conflict ${conflict}`,
    params,
  );
};

Users.createMany = (rows) => bulk('users',
  ['id', 'email', 'username', 'password_hash', 'created_at', 'onboarded'], rows,
  (r) => [r.id, r.email, r.username, r.password_hash, r.created_at, r.onboarded ?? true]);

Reviews.upsertMany = (rows) => bulk('reviews',
  ['id', 'user_id', 'game_id', 'verdict', 'body', 'hours', 'created_at', 'updated_at'], rows,
  (r) => [r.id, r.user_id, r.game_id, r.verdict, r.body, r.hours, r.created_at, r.updated_at],
  `(user_id, game_id) do update set verdict = excluded.verdict, body = excluded.body,
     hours = excluded.hours, updated_at = excluded.updated_at`);

/* --------------------------------- hubs ----------------------------------- */

export const Hubs = {
  join: (franchise, userId, at = Date.now()) => run(
    `insert into hub_members (franchise, user_id, created_at) values ($1, $2, $3)
     on conflict (franchise, user_id) do nothing`, [franchise, userId, at]),
  leave: (franchise, userId) => run(
    `delete from hub_members where franchise = $1 and user_id = $2`, [franchise, userId]),
  isMember: async (franchise, userId) => !!await one(
    `select 1 as yes from hub_members where franchise = $1 and user_id = $2`, [franchise, userId]),
  memberCounts: async () => new Map(
    (await all(`select franchise, count(*) as n from hub_members group by franchise`))
      .map((r) => [r.franchise, r.n])),
  postCounts: async () => new Map(
    (await all(`select franchise, count(*) as n from posts where hidden = false group by franchise`))
      .map((r) => [r.franchise, r.n])),
  mine: async (userId) => (await all(
    `select franchise from hub_members where user_id = $1 order by created_at desc`, [userId]))
    .map((r) => r.franchise),
};

/* --------------------------------- posts ---------------------------------- */

export const Posts = {
  create: (row) => run(
    `insert into posts (id, franchise, user_id, title, body, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [row.id, row.franchise, row.user_id, row.title, row.body, row.created_at, row.updated_at],
  ),
  forHub: (franchise) => all(
    `select p.id, p.user_id, p.title, p.body, p.created_at, p.updated_at, u.username,
            (select count(*) from post_votes v where v.post_id = p.id)                     as upvotes,
            (select count(*) from comments c where c.post_id = p.id and c.hidden = false)  as comment_count
       from posts p join users u on u.id = p.user_id
      where p.franchise = $1 and p.hidden = false`,
    [franchise],
  ),
  byId: (id) => one(`select * from posts where id = $1`, [id]),
  remove: (id, userId) => run(`delete from posts where id = $1 and user_id = $2`, [id, userId]),

  vote: (postId, userId, at = Date.now()) => run(
    `insert into post_votes (post_id, user_id, created_at) values ($1, $2, $3)
     on conflict (post_id, user_id) do nothing`, [postId, userId, at]),
  unvote: (postId, userId) => run(
    `delete from post_votes where post_id = $1 and user_id = $2`, [postId, userId]),
  myVotes: async (userId, franchise) => new Set(
    (await all(
      `select post_id from post_votes
        where user_id = $1 and post_id in (select id from posts where franchise = $2)`,
      [userId, franchise])).map((r) => r.post_id)),

  addComment: (row) => run(
    `insert into comments (id, post_id, user_id, body, created_at) values ($1, $2, $3, $4, $5)`,
    [row.id, row.post_id, row.user_id, row.body, row.created_at],
  ),
  comments: (postId) => all(
    `select c.id, c.post_id, c.user_id, c.body, c.created_at, u.username
       from comments c join users u on u.id = c.user_id
      where c.post_id = $1 and c.hidden = false
      order by c.created_at asc`, [postId]),
  commentById: (id) => one(`select * from comments where id = $1`, [id]),
  removeComment: (id, userId) => run(
    `delete from comments where id = $1 and user_id = $2`, [id, userId]),
};

/* -------------------------------- reviews --------------------------------- */

export const REPORT_THRESHOLD = 4;

export const Reviews = {
  upsert: (row) => run(
    `insert into reviews (id, user_id, game_id, verdict, body, hours, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (user_id, game_id) do update set
       verdict = excluded.verdict, body = excluded.body,
       hours = excluded.hours, updated_at = excluded.updated_at`,
    [row.id, row.user_id, row.game_id, row.verdict, row.body, row.hours,
     row.created_at, row.updated_at],
  ),
  // filter(where ...) rather than sum() on a boolean, and u.username has to be
  // in the group by: Postgres will not infer it from another table's key.
  forGame: (gameId) => all(
    `select r.id, r.user_id, r.game_id, r.verdict, r.body, r.hours,
            r.created_at, r.updated_at, u.username,
            count(v.review_id) filter (where v.helpful)       as helpful_yes,
            count(v.review_id) filter (where not v.helpful)   as helpful_no
       from reviews r
       join users u on u.id = r.user_id
       left join review_votes v on v.review_id = r.id
      where r.game_id = $1 and r.hidden = false
      group by r.id, u.username
      order by r.updated_at desc`,
    [gameId],
  ),
  byId: (id) => one(`select * from reviews where id = $1`, [id]),
  counts: (min = 1) => all(
    `select game_id,
            count(*) as n,
            count(*) filter (where verdict = 'recommend') as yes
       from reviews
      where hidden = false
      group by game_id
      having count(*) >= $1
      order by n desc`, [min]),
  mine: (userId, gameId) => one(
    `select * from reviews where user_id = $1 and game_id = $2`, [userId, gameId]),
  remove: (id, userId) => run(`delete from reviews where id = $1 and user_id = $2`, [id, userId]),

  // helpful comes back as 0/1 so callers comparing `=== 1` behave as they do
  // against SQLite.
  votesBy: (userId, gameId) => all(
    `select review_id, case when helpful then 1 else 0 end as helpful
       from review_votes
      where user_id = $1 and review_id in (select id from reviews where game_id = $2)`,
    [userId, gameId]),
  vote: (reviewId, userId, helpful, at = Date.now()) => run(
    `insert into review_votes (review_id, user_id, helpful, created_at)
     values ($1, $2, $3, $4)
     on conflict (review_id, user_id)
       do update set helpful = excluded.helpful, created_at = excluded.created_at`,
    [reviewId, userId, !!helpful, at]),
  unvote: (reviewId, userId) => run(
    `delete from review_votes where review_id = $1 and user_id = $2`, [reviewId, userId]),

  /** Returns true when this report tipped the review into hidden. */
  report: (reviewId, userId, reason, at = Date.now()) => withTransaction(async (client) => {
    await client.query(
      `insert into review_reports (review_id, user_id, reason, created_at)
       values ($1, $2, $3, $4) on conflict (review_id, user_id) do nothing`,
      [reviewId, userId, reason, at]);
    const { rows } = await client.query(
      `select count(*) as n from review_reports where review_id = $1`, [reviewId]);
    if (rows[0].n >= REPORT_THRESHOLD) {
      await client.query(`update reviews set hidden = true where id = $1`, [reviewId]);
      return true;
    }
    return false;
  }),
};

Posts.createMany = (rows) => bulk('posts',
  ['id', 'franchise', 'user_id', 'title', 'body', 'created_at', 'updated_at'], rows,
  (r) => [r.id, r.franchise, r.user_id, r.title, r.body, r.created_at, r.updated_at]);

Posts.addCommentMany = (rows) => bulk('comments',
  ['id', 'post_id', 'user_id', 'body', 'created_at'], rows,
  (r) => [r.id, r.post_id, r.user_id, r.body, r.created_at]);

Posts.voteMany = (rows) => bulk('post_votes',
  ['post_id', 'user_id', 'created_at'], rows,
  (r) => [r.post_id, r.user_id, r.created_at ?? Date.now()]);

Hubs.joinMany = (rows) => bulk('hub_members',
  ['franchise', 'user_id', 'created_at'], rows,
  (r) => [r.franchise, r.user_id, r.created_at ?? Date.now()]);

export const BACKEND = 'postgres';
export const DB_PATH = '(postgres)';
