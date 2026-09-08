# Demo crib sheet

## Which URL to use

**Present from your laptop**, not the deployed site:

```bash
cd ~/code/playstyle && npm start
```

The Vercel deployment (https://playstyle-9m6ywi141-coded14.vercel.app) is a
shareable link, not a reliable demo: each serverless container has its own
database copy, so accounts and posts do not persist predictably. Local is a
real persistent backend.

## Before you present

```bash
cd ~/code/playstyle && npm start
```

Then open **http://localhost:3000**. That's it — Node is on your PATH now, so a
fresh Terminal works.

**To reset to a clean, pre-populated state** (do this the night before, not
live — it takes a few seconds):

```bash
cd ~/code/playstyle && npm run db:reset && npm run db:demo && npm start
```

That wipes all accounts and reloads 10 demo users, 32 reviews and 10 hub
discussions, so nothing you show is empty.

**Sign in as a demo user** if you want a populated account instantly:
`demo_lorehound@demo.playstyle.local` (a soulslike fan), or `demo_sprintreload@demo.playstyle.local`
(a Call of Duty fan). Password for all of them:
`demo-account-not-for-production`

---

## The 6-step walkthrough

Do it in this order — it tells a story instead of listing features.

**1. Landing page.** "You don't need an account to start." Pick 3–4 games —
pick **Call of Duty, Counter-Strike 2 and Elden Ring** so the results are
obviously mixed. Click **Show my matches**.

**2. The guest preview.** Three real recommendations appear, plus a taste
profile. Point at the line under a card:

> *Because you love Elden Ring — you both share dark fantasy, soulslike, action rpg*

> "It doesn't just recommend, it shows its reasoning. That's deliberate — an
> unexplained recommendation feels arbitrary even when it's right."

**3. Sign up.** Click **Save my profile**. Note the green banner: *"3 picks
from your quiz will be saved to this account."*

> "The quiz runs before signup on purpose. Nobody hits a wall before they've
> seen anything worth signing up for."

While the form is open, mention what's behind it: passwords hashed with
bcrypt, session token in an httpOnly cookie, login rate-limited.

**4. The feed.** Rate a card **Not for me** and watch two things happen at
once: the card animates out, and the taste profile bars on the right reorder.
Then click **Undo** in the toast.

> "Every rating retrains the profile. The bars are the model, visible."

**5. Click a game title → the detail page.** This is the bit to spend time on.
Open **Elden Ring**. Point at the two summary cards:

- All reviewers: **25% recommend**
- Your closest match (**97%**) — *recommends it*

> "Same page, different answer depending on who's reading. A souls player's
> 97% match recommends this. A cozy player's 100% match says avoid. A star
> average tells both of them the same useless thing."

Each review shows the reviewer's taste — *"Loves Elden Ring, Dark Souls III,
Bloodborne"* — so you can judge how much their verdict should count.

**6. Fandoms → Call of Duty.** The hub holds all three CoD games. Posts show
the author's taste match too. Upvote something, expand a comment thread, post
a reply.

> "Your fandoms surface from games you already like, so it never opens as a
> wall of 134 empty franchises."

**Optional flourish:** hit the theme toggle (light/dark), or resize the window
narrow to show it works on a phone.

---

## The one sentence to land

> "Steam can recommend you a game. It can't tell you what people who like the
> same games as you thought of it. That's the whole product."

---

## If they ask to see code

| Question | File |
|---|---|
| "Show me the algorithm" | `server/lib/recommend.js` — scoring, diversification, explanations |
| "Show me the login" | `server/routes/auth.js` and `server/lib/auth.js` |
| "Where's the database?" | `server/lib/db.js` — every SQL statement in the app is here |
| "Show me the front end" | `public/js/feed.js`, `public/css/tokens.css` |
| "Where's the taste match?" | `matchBetween()` in `server/lib/recommend.js` |

---

## Likely questions, honest answers

**"Why not collaborative filtering / 'users who liked X also liked Y'?"**
No usage data on day one — it has nothing to work with, which is the cold-start
problem. Content-based tag matching works from the very first pick, and it can
explain itself, which collaborative filtering can't.

**"How does the match percentage actually work?"**
Each game is a vector of playstyle tags plus genres, weighted by inverse
document frequency so `souls-like` counts far more than `multiplayer`. Your
taste vector is the weighted sum of everything you've rated. The match is the
cosine similarity, adjusted by a mild review-score prior. The displayed number
is a monotonic curve over that score, so the percentages always descend down
the page.

**"How do you stop it recommending six versions of the same shooter?"**
Greedy diversification: one game per franchise, plus a penalty for candidates
that mostly repeat something already picked.

**"Why SQLite and not MySQL/Postgres?"**
Zero setup, single file, and WAL mode makes it genuinely fast for reads. Every
SQL statement lives in one module, so swapping to Postgres is a one-file
change if it ever needed to scale past one server.

**"Why no React/framework?"**
The requirement was HTML, CSS and JavaScript, and there's no build step to
explain or break — you can read any file and see exactly what it does.
About 4,900 lines total.

**"Is the login secure?"**
bcrypt at cost 12; the session token is stored as an HMAC, so a leaked
database can't be replayed as live logins; httpOnly + SameSite cookie; login
rate-limited on IP *and* email; a wrong password and an unknown account give
an identical message *and* take the same time; Origin checks on every write;
CSP blocks inline scripts; all SQL parameterised.

**"Where did the game data come from?"**
A hand-curated catalog of 148 games — `data/games.json`. Real products would
use the RAWG or IGDB API; the data layer is shaped so that's an adapter swap.

**"Are these real reviews?"**
No, and that's flagged in the code and README. `npm run db:demo` creates them
for development so the feature can be demonstrated. Shipping invented reviews
as real would poison the one feature that makes the site worth using.

**"How are the fandom names generated?"**
Derived, not hand-typed: the longest common prefix of the game titles in a
franchise. Three Call of Duty titles give "Call of Duty". Adding a game never
means editing a name table.

---

## Limits to admit if pressed

Saying these *before* you're asked reads as judgement, not as gaps.

- **No moderation dashboard.** Four reports auto-hide a review, but restoring
  one needs SQL. Deliberate scope call — no real users to moderate.
- **No password reset or email verification.** Both need email infrastructure
  that a class project doesn't have.
- **Cover art is generated,** not licensed — colour is derived from the game's
  primary genre. Real key art needs licensing deals.
- **Rate limiting is in-process,** so it works for one server. More than one
  would need Redis.
