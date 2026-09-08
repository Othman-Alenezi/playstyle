/**
 * The game catalog, loaded once at boot and turned into TF-IDF style
 * tag vectors. Everything the recommender needs is precomputed here.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, '..', '..', 'data', 'games.json'), 'utf8'));

// Genres are coarse but high-signal, so they enter the vector as their own
// namespaced tags with extra weight.
const GENRE_WEIGHT = 1.45;

/**
 * Some tags describe how a game is *sold*, not how it *plays*. Left at full
 * weight they create nonsense matches -- a Call of Duty fan was being
 * recommended NBA 2K purely because both are seasonal live-service releases.
 * Halving them keeps the information without letting it drive a match.
 */
const META_TAGS = new Set([
  'live-service', 'seasonal', 'f2p', 'aaa', 'indie', 'cheap', 'gacha',
  'mod-support', 'remake', 'trilogy', 'tutorial-rich', 'accessibility',
  'wheel-recommended', 'podcast-game', 'one-playthrough', 'cult-classic',
  'long', 'short', 'varied', 'beautiful', 'soundtrack',
]);
const META_WEIGHT = 0.45;

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const featuresOf = (g) => [
  ...g.tags.map((t) => [t, META_TAGS.has(t) ? META_WEIGHT : 1]),
  ...g.genres.map((x) => [`genre:${slug(x)}`, GENRE_WEIGHT]),
];

export const genreKeys = (g) => g.genres.map((x) => slug(x));

/* --------------------------- inverse document freq -------------------------- */

const N = raw.length;
const df = new Map();
for (const g of raw) {
  for (const [f] of featuresOf(g)) df.set(f, (df.get(f) ?? 0) + 1);
}
/** Rare tags say more about taste than "multiplayer" does. */
export const idf = (f) => Math.log(1 + N / (df.get(f) ?? N));

/* ------------------------------- game vectors ------------------------------ */

function unitVector(g) {
  const v = new Map();
  for (const [f, w] of featuresOf(g)) v.set(f, w * idf(f));
  let norm = 0;
  for (const w of v.values()) norm += w * w;
  norm = Math.sqrt(norm) || 1;
  for (const [f, w] of v) v.set(f, w / norm);
  return v;
}

export const games = raw.map((g) => ({ ...g, vector: unitVector(g) }));
export const byId = new Map(games.map((g) => [g.id, g]));

/**
 * Which games have downloaded cover art. Read once at boot: the set is small
 * and the alternative is a filesystem check per game per request.
 * Without `npm run covers` this is empty and every cover falls back to the
 * generated gradient, which is a supported state rather than a broken one.
 */
const COVER_DIR = join(here, '..', '..', 'public', 'covers');
const withArt = new Set(
  existsSync(COVER_DIR)
    ? readdirSync(COVER_DIR).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4))
    : [],
);

/**
 * The art is 21 MB of copyrighted promotional images, so it is not committed.
 * data/covers.json records which Steam app each game maps to, letting a
 * deployment that has no local files fall back to Steam's own CDN.
 */
const MANIFEST_PATH = join(here, '..', '..', 'data', 'covers.json');
const manifest = existsSync(MANIFEST_PATH)
  ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  : {};
const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

function coverUrl(id) {
  if (withArt.has(id)) return `/covers/${id}.jpg`;
  const entry = manifest[id];
  if (entry) return `${STEAM_CDN}/${entry.appid}/${entry.variant || 'library_600x900.jpg'}`;
  return null;
}

/** Strip the vector before sending a game over the wire. */
export const publicGame = (g) => ({
  id: g.id, title: g.title, year: g.year, franchise: g.franchise,
  rating: g.rating, genres: g.genres, tags: g.tags, blurb: g.blurb,
  cover: coverUrl(g.id),
});

/* --------------------------------- similarity ------------------------------ */

/** Cosine similarity of two unit vectors, iterating the smaller one. */
export function cosine(a, b) {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [f, w] of small) {
    const o = big.get(f);
    if (o !== undefined) dot += w * o;
  }
  return dot;
}

/** Tags shared by two games, ranked by how much they drove the match. */
export function sharedFeatures(a, b, limit = 3) {
  const out = [];
  for (const [f, w] of a.vector) {
    const o = b.vector.get(f);
    if (o !== undefined && !f.startsWith('genre:')) out.push([f, w * o]);
  }
  return out.sort((x, y) => y[1] - x[1]).slice(0, limit).map(([f]) => f);
}

/* ------------------------------ onboarding grid ---------------------------- */

/**
 * The taste-picker grid. Popular games first, but capped per franchise and
 * spread across genres so the grid can't be all shooters -- a user who likes
 * exactly one niche thing still needs to find it here.
 */
export function pickerGrid(size = 42) {
  const byPop = [...games].sort((a, b) => b.pop - a.pop);
  const chosen = [];
  const franchiseCount = new Map();
  const genreCount = new Map();
  const maxPerGenre = Math.ceil(size / 5);

  for (const pass of [1, 2]) {
    for (const g of byPop) {
      if (chosen.length >= size) break;
      if (chosen.includes(g)) continue;
      const fc = franchiseCount.get(g.franchise) ?? 0;
      if (fc >= 1) continue;
      const primary = g.genres[0];
      const gc = genreCount.get(primary) ?? 0;
      if (pass === 1 && gc >= maxPerGenre) continue;
      chosen.push(g);
      franchiseCount.set(g.franchise, fc + 1);
      genreCount.set(primary, gc + 1);
    }
  }
  return chosen.slice(0, size);
}

export const stats = {
  games: N, features: df.size,
  covers: withArt.size, coversViaCdn: Object.keys(manifest).length,
};
