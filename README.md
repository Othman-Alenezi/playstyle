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

For a persistent backend, run it as a normal process (Render, Railway, Fly, or
a VPS) where the SQLite file survives, or swap `server/lib/db.js` for Postgres.

### Sessions on a serverless host

Two strategies, picked automatically (`SESSION_MODE` in `server/lib/auth.js`,
reported by `/api/health`):

- **database** (local, and any normal server): the cookie is an opaque random
  token and the server stores only an HMAC of it, so sessions are revocable.
- **stateless** (serverless): the identity is signed into the cookie, because
  containers do not share a database and a session row written by one does not
  exist in the next.

Three separate things all had to be fixed before a deployed login would hold:

1. The signing key was generated per process, so every container rejected the
   others' cookies. It now comes from `SESSION_SECRET`, or from `.session-key`
   written once at build time by `scripts/gen-session-key.mjs`.
2. Sessions were database rows, which do not exist in a container that did not
   issue them. Hence stateless mode.
3. The demo seed used random UUIDs, so `demo_lorehound` had a different id in
   every container and a valid cookie still pointed at a missing user. Seeded
   ids are now derived from their names, so all containers agree.

Set `SESSION_SECRET` for a real deployment; otherwise sessions end at each
redeploy, when the build key is regenerated.

#### Accounts on the deployed demo

Registering works, and the session then holds up wherever requests land: the
signed cookie carries the account and the ratings behind the taste profile, so
a container that has never seen the account rebuilds it, and containers
reconcile their ratings against the cookie so the match list is the same
everywhere.

What still does not work there is **signing in again with the password**. The
hash lives only in the container that handled the registration, and a rebuilt
row is deliberately marked as unable to verify one -- signing in says so
plainly, and signing up again reclaims the row rather than reporting the email
as taken. In practice the 30-day cookie means there is rarely a reason to sign
in again.

Fixing that properly means shared storage, not a cookie: run the app as a
normal process where SQLite persists, or move `server/lib/db.js` to Postgres.

## Running it

```bash
npm install
npm run db:seed     # creates data/playstyle.db
npm run db:demo     # optional: demo accounts + reviews, for development only
npm start           # http://localhost:3000
```

`npm run db:demo` creates ten `demo_*` accounts with deliberately different
tastes and 32 reviews between them, so the taste-match feature can be seen
before there are real users. It is development scaffolding, not launch content —
**do not run it against production.** Every account shares the password printed
by the script.

`npm run dev` restarts on file changes. `npm run db:reset` wipes the database and
recreates the schema.

Node 20+ required (developed on 24 LTS). Copy `.env.example` to `.env` before
deploying — `SESSION_SECRET` is mandatory in production and the server refuses to
boot without it.

## What's built

| Area | State |
| --- | --- |
| Taste quiz (guest, no account) | done |
| Recommendation engine + explanations | done |
| Signup / login / logout, sessions | done |
| Recommendation feed with ratings that retrain the profile | done |
| Taste profile visualisation | done |
| Game detail page | done |
| Taste-matched reviews, voting, reporting | done |
| Fandom hubs: posts, upvotes, comments, membership | done |

## Layout

```
data/games.json        148-game catalog: genres, playstyle tags, blurbs
server/
  index.js             app wiring, CSP, static files, error handling
  middleware.js        session lookup, auth guard, rate limiting, origin check
  lib/db.js            every SQL statement in the app
  lib/catalog.js       loads the catalog, builds TF-IDF tag vectors
  lib/recommend.js     scoring, diversification, explanations
  lib/auth.js          bcrypt hashing, opaque session tokens
  lib/validate.js      input rules (mirrored on the client)
  lib/validate-review.js  review input rules
  lib/hubs.js          fandom metadata derived from the catalog, hot ranking
  routes/              auth.js, games.js, taste.js, reviews.js, hubs.js
public/
  index.html           landing + taste quiz + guest preview
  auth.html            sign in / create account
  app.html             recommendation feed
  game.html            one game: your match, and reviews ranked by taste match
  fandoms.html         hub directory, your fandoms first
  hub.html             one fandom: posts, upvotes, comments
  css/tokens.css       every colour, size and timing in the product
  css/styles.css       components
  css/pages.css        page layouts
  js/                  api client, UI helpers, one module per page
```

## How the recommender works

There is no co-play data on day one, so collaborative filtering has nothing to
work with. This is content-based instead, which works from the very first pick
and — more importantly — can explain itself.

1. **Features.** Each game becomes a vector of its playstyle tags plus its
   genres (genres carry 1.45× weight). Every feature is scaled by inverse
   document frequency, so `souls-like` counts for far more than `multiplayer`.
2. **Business-model tags are halved.** `live-service`, `f2p`, `seasonal`, `aaa`
   and friends describe how a game is *sold*, not how it *plays*. At full weight
   they recommended NBA 2K to a Call of Duty player.
3. **Taste vector.** Sum the vectors of everything rated, weighted by signal:
   `love +1.0`, `wishlist +0.5`, `played +0.25`, `meh −0.7`. Negative weights
   stay in the vector so disliked tags actively push candidates down.
4. **Score.** Cosine similarity, times a mild quality prior from review score,
   times a light popularity tie-break. A candidate sharing no genre with
   anything you like is multiplied by 0.74 — cross-genre picks are how people
   discover things, they just shouldn't outrank the obvious ones.
5. **Diversify.** Greedy selection: one game per franchise, and a penalty for
   candidates that mostly repeat something already picked. Without it the feed
   becomes six flavours of the same shooter.
6. **Explain.** Attribute the match to the single rated game that best accounts
   for it, and name the top shared tags: *"Because you love Elden Ring — you
   both share dark fantasy, soulslike, action rpg."*

The displayed match percentage is a monotonic curve over the same blended score
used for ranking, so the numbers always descend down the page.

Tuning constants live at the top of `server/lib/recommend.js`.

## Taste-matched reviews

This is the part that has no equivalent on a storefront. Every review carries
the reviewer's own taste profile and a **taste match** percentage against the
person reading it — the cosine of their two taste vectors, on the same display
curve as game matches. Reviews are ranked by that match by default.

It changes what the same page tells different people. Elden Ring in the demo
data sits at 25% recommend overall, but:

- a souls player's closest match (97%) recommends it
- a cozy player's closest match (100%) says avoid

A star average would have told both of them the same useless thing.

Two deliberate restraints on the aggregate:

- **Your own review is excluded** from "players with your taste" — you match
  yourself 100%, so counting it just reflects your own opinion back at you.
- **It needs three matched reviewers** before it appears. "100% of players like
  you recommend this" off one review is a lie dressed as a statistic; the card
  says plainly why the number is missing instead.

Reviewer privacy is deliberately narrow: at most three games they love and
their three strongest tags. Posting a review is the opt-in for showing it.

**Moderation:** reviews are one-per-person-per-game and editable. Four reports
auto-hide a review pending review (`REPORT_THRESHOLD` in `server/lib/db.js`).
There is no admin UI yet — hidden reviews have to be un-hidden in SQL. That is
the main gap before opening reviews to the public.

## Fandom hubs

A hub is a franchise, so there is no hubs table — membership and posts
reference the franchise slug from `data/games.json` directly. Adding a game
adds it to its franchise's hub automatically.

**Hub names are derived, not maintained.** The display name is the longest
common prefix of the titles in the franchise, cut to a word boundary: three
Call of Duty games give "Call of Duty", and `hollow-knight` gives "Hollow
Knight" even though one title is a prefix of the other. A single-game
franchise uses that game's title. When the titles share nothing, the slug is
tidied instead — which is how the `soulsborne` hub holding Elden Ring, Sekiro
and Bloodborne gets its name.

**Two things keep hubs from feeling dead**, which is what usually kills this
kind of feature:

- The directory leads with hubs tied to games you already like, then hubs with
  actual activity, and only then the full list. A wall of 134 franchises you
  have no connection to is not a community.
- Posting or commenting joins the hub. Asking someone to press Join first is
  friction for no benefit.

Posts carry the author's taste profile and taste match, same as reviews — you
can see whether the person arguing about balance actually plays this kind of
game. Ranking is Hacker News style decay (`hotScore` in `server/lib/hubs.js`)
so an old popular thread cannot hold the front page. Comments load on demand
when a thread is expanded, so a hub with fifty posts is one request, not
fifty-one.

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
