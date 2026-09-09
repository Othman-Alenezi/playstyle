# Playstyle

Game recommendations built from a taste profile, that explain their own reasoning —
and (next slice) reviews weighted toward players who share your taste.

Front end is plain HTML/CSS/JS with no build step. Back end is Express + SQLite.

---

**Live:** https://playstyle-coded14.vercel.app
**Source:** https://github.com/Othman-Alenezi/playstyle

## Deploying

The deployment is a demo, not a production backend. SQLite lives on the
serverless filesystem, so each container gets its own copy in `/tmp`: writes
work within a container's lifetime, but two visitors may land on different
containers and a restart resets to the seeded demo content. `IS_EPHEMERAL` in
`server/lib/db.js` is what detects this and seeds the demo data at boot.

### Everything is in Supabase

`server/lib/db.js` picks the data layer. The default, and what the deployment
uses, is `db-supabase.js`: Supabase's REST API over HTTPS.

**Why HTTPS rather than a Postgres connection.** The wire protocol needs a
connection string, which is a secret that has to be configured on the host.
The REST API needs only the publishable key, which exists to be embedded in
client code. So the deployment needs no environment variables at all --
nothing to configure, nothing to leak, nothing to forget.

`db-postgres.js` is still there and is used when `DATABASE_URL` is set. It is
faster and supports real transactions, so it is the better choice on a host
where setting a connection string is straightforward.

**Access control is RLS, not the application.** Every table has policies (see
the migrations). Writes are scoped to `auth.uid()`, so the server cannot write
a row as somebody else even if a bug tried to. Reads follow what the app
actually shows: reviews, posts and usernames are readable by anyone, because
a signed-out visitor browses them; reports are readable only by their author.

The signed-in person's access token travels in async context
(`AsyncLocalStorage`) rather than as a parameter on every call. That is why
moving the backend to Supabase changed no route: the data layer picks up the
token itself, so RLS sees a real `auth.uid()` on every query.

Two consequences of PostgREST worth knowing:

- **No transactions.** `withTransaction` runs the body directly. The places
  that used it -- the report threshold and the demo seed -- are written to be
  idempotent instead.
- **No GROUP BY.** Tallies come from views (`review_stats`, `post_stats`,
  `hub_stats`, `report_stats`), declared `security_invoker` so the underlying
  RLS still applies. Per-row counts use aggregate embeds on real foreign keys.

## Registration and sign-in (Supabase Auth)

Credentials are handled by **Supabase Auth**, so this app never receives a
password. The flow:

1. The browser signs up or signs in against Supabase directly, using the
   **publishable** key. That key exists to be embedded in client code, so it
   is committed in `server/lib/supabase.js` -- there is no secret to configure
   and the deployment needs no environment variables at all.
2. Supabase returns an access token. The browser posts it to
   `POST /api/auth/supabase`.
3. The server verifies that token against Supabase's **public JWKS endpoint**
   (`ES256`), mirrors the identity into the local `users` table, and issues the
   same httpOnly session cookie the rest of the app already used.

Three decisions worth explaining:

- **No `supabase-js`.** The library would have to load from a CDN, which means
  loosening `script-src` in the CSP. Two `fetch` calls do the same job and
  `script-src 'self'` stays intact.
- **The Supabase token is never stored in the browser.** It is exchanged
  immediately for our own httpOnly cookie and discarded, so an injected script
  cannot read it. The refresh token is thrown away.
- **Only `ES256` is accepted.** The project also has a legacy `HS256` anon key
  whose secret is effectively public; accepting that algorithm would let
  anyone mint a valid-looking session. There is a test for this.

A registration writes `auth.users` (managed by Supabase) and, via the
`on_auth_user_created` trigger, `public.profiles`. Profiles carry RLS policies
so a signed-in user can read any profile but only modify their own.

The app's own `/api/auth/signup` and `/api/auth/login` remain as a fallback
for working offline; the page uses Supabase whenever `/api/config` advertises
it.

## Security posture

- Passwords: bcrypt, cost 12. Login compares against a dummy hash when the
  account doesn't exist, so a missing account and a wrong password are
  indistinguishable in both message and timing.
- Sessions: 32 random bytes in an `httpOnly` + `SameSite=Lax` cookie (`Secure`
  in production). The database stores only an HMAC of the token, so a database
  leak cannot be replayed as live logins.
- Rate limits: signup 10/hour per IP; login 12/15min keyed on IP **and** email,
  so one attacker can't lock out a shared IP or spray one password across
  accounts.
- CSRF: `SameSite=Lax` plus an Origin check on every state-changing request.
- CSP: `script-src 'self'` — no inline scripts anywhere. The client builds DOM
  through a helper that only ever sets `textContent`; there is no `innerHTML`
  path for user content.
- All SQL is parameterised via prepared statements.

**Before going live:** set `SESSION_SECRET` and `ALLOWED_ORIGINS`, serve over
HTTPS, and set `NODE_ENV=production`.

## Known limits

- **Rate limiting is per-process.** Running more than one app server means
  moving it to Redis (`server/middleware.js`).
- **SQLite is single-writer.** Fine for one instance with WAL enabled, which is
  how it's configured. Horizontal scaling means Postgres — all SQL is confined
  to `server/lib/db.js` to keep that a one-file change.
- **Cover art is generated,** not licensed. Colour is derived from the primary
  genre with a small per-game offset. Real key art needs licensing.
- **Catalog is hand-curated** and will go stale. Swapping in RAWG or IGDB means
  writing an adapter that outputs the same shape as `data/games.json`.
- **Signup confirms whether an email is registered.** A deliberate trade for a
  usable error message.
- **No moderation UI.** Reports auto-hide at a threshold, but reviewing and
  restoring hidden reviews needs SQL. Build this before reviews open publicly.
- **Reviewer taste is computed per request.** Fine at this size (one query for
  all reviewers, then vector maths in memory). A game with thousands of reviews
  will want the vectors cached.

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/games` | – | Browse the catalogue: `q`, `genre`, `sort`, `limit`, `offset` |
| GET | `/api/games/:id/similar` | – | Closest games, one per franchise |
| GET | `/api/reviews/highlights` | – | Most-reviewed games, for the landing page |
| GET | `/api/games/picker` | – | 42 games for the taste quiz, spread across genres |
| GET | `/api/games/:id` | – | One game, plus your rating if signed in |
| POST | `/api/preview` | – | Recommendations for unsaved picks (guest quiz) |
| POST | `/api/auth/signup` | – | Create account; accepts `seed` picks from the quiz |
| POST | `/api/auth/login` | – | Sign in; also accepts `seed` |
| POST | `/api/auth/logout` | – | Destroy the session |
| GET | `/api/auth/me` | – | Current user, or `null` |
| DELETE | `/api/auth/me` | yes | Delete account and all its data |
| POST | `/api/seed` | yes | Save quiz picks as `love` ratings |
| GET | `/api/recommendations` | yes | Ranked matches with explanations |
| GET | `/api/profile` | yes | Taste profile, library, counts |
| POST | `/api/feedback` | yes | Rate a game; returns the updated profile |
| DELETE | `/api/feedback/:gameId` | yes | Undo a rating |
| GET | `/api/games/:id/reviews` | – | Reviews, each with a taste match when signed in |
| POST | `/api/games/:id/reviews` | yes | Post or update your review |
| DELETE | `/api/games/:id/reviews` | yes | Delete your review |
| POST | `/api/reviews/:id/vote` | yes | Helpful / not helpful / clear |
| POST | `/api/reviews/:id/report` | yes | Report a review |
| GET | `/api/hubs` | – | Hub directory; your fandoms first when signed in |
| GET | `/api/hubs/:slug` | – | One hub: games, posts, membership |
| POST | `/api/hubs/:slug/join` | yes | Join, or leave with `{leave:true}` |
| POST | `/api/hubs/:slug/posts` | yes | Start a discussion (also joins) |
| DELETE | `/api/posts/:id` | yes | Delete your post |
| POST | `/api/posts/:id/vote` | yes | Upvote / remove upvote |
| GET | `/api/posts/:id/comments` | – | Comments on a post |
| POST | `/api/posts/:id/comments` | yes | Reply |
| DELETE | `/api/comments/:id` | yes | Delete your comment |
| GET | `/api/health` | – | Liveness plus catalog stats |
