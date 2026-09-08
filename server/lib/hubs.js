/**
 * Fandom hub metadata, derived from the catalog rather than hand-maintained.
 *
 * A hub is a franchise. Its display name comes from the games in it: the
 * longest common title prefix ("Call of Duty: Warzone" + "Call of Duty:
 * Black Ops 6" -> "Call of Duty"), a single game's own title when the
 * franchise has one entry, and a tidied slug when the titles share nothing
 * (the soulsborne hub holds Elden Ring, Sekiro and Bloodborne).
 *
 * Deriving it means adding a game to data/games.json never requires touching
 * a name table.
 */
import { games, publicGame } from './catalog.js';

const SMALL_WORDS = new Set(['of', 'the', 'in', 'is', 'and', 'a', 'to', 'from', 'for']);
const ACRONYMS = new Map([['gta', 'GTA'], ['pubg', 'PUBG'], ['xcom', 'XCOM'], ['dbd', 'DBD'], ['ark', 'ARK']]);

function titleFromSlug(slug) {
  return slug.split('-').map((word, i) => {
    if (ACRONYMS.has(word)) return ACRONYMS.get(word);
    if (i > 0 && SMALL_WORDS.has(word)) return word;
    return word[0].toUpperCase() + word.slice(1);
  }).join(' ');
}

/** Longest common prefix of the titles, cut back to a word boundary. */
function commonPrefix(titles) {
  if (titles.length < 2) return '';
  let end = 0;
  outer: for (; end < titles[0].length; end++) {
    for (const t of titles) if (t[end] !== titles[0][end]) break outer;
  }
  const cut = titles[0].slice(0, end);
  // If the prefix already ends on a word boundary in every title -- which is
  // the case when one title is a prefix of another ("Hollow Knight" inside
  // "Hollow Knight: Silksong") -- keep it whole. Otherwise trim back to the
  // last space so a word is never cut in half ("Grand Theft Auto V" and
  // "... Online" share "Grand Theft Auto " plus a stray letter).
  const endsCleanly = titles.every((t) => t.length === end || /[^A-Za-z0-9]/.test(t[end]));
  const atBoundary = endsCleanly || !cut.includes(' ') ? cut : cut.slice(0, cut.lastIndexOf(' '));
  return atBoundary.replace(/[\s:–—-]+$/, '').trim();
}

function nameFor(slug, franchiseGames) {
  if (franchiseGames.length === 1) return franchiseGames[0].title;
  const prefix = commonPrefix(franchiseGames.map((g) => g.title));
  // A two-character "prefix" is a coincidence, not a franchise name.
  return prefix.length >= 3 ? prefix : titleFromSlug(slug);
}

const grouped = new Map();
for (const g of games) {
  if (!grouped.has(g.franchise)) grouped.set(g.franchise, []);
  grouped.get(g.franchise).push(g);
}

/** slug -> { slug, name, games, tags, pop } */
export const hubs = new Map([...grouped].map(([slug, list]) => {
  const sorted = [...list].sort((a, b) => b.pop - a.pop);
  // The tags shared by the whole franchise describe what its fans are into.
  const counts = new Map();
  for (const g of sorted) for (const t of g.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5).map(([t]) => t);

  return [slug, {
    slug,
    name: nameFor(slug, sorted),
    games: sorted.map(publicGame),
    tags,
    pop: Math.max(...sorted.map((g) => g.pop)),
  }];
}));

export const hubList = [...hubs.values()].sort((a, b) => b.pop - a.pop);

/** Hub summary without the full game list, for directory listings. */
export const hubBrief = (hub) => ({
  slug: hub.slug,
  name: hub.name,
  tags: hub.tags,
  gameCount: hub.games.length,
  // `cover` has to survive this trim or the hub cards render as flat colour
  // blocks instead of the games' artwork.
  games: hub.games.slice(0, 3).map((g) => ({
    id: g.id, title: g.title, genres: g.genres, year: g.year, cover: g.cover,
  })),
});

/** Franchises represented in a set of game ids -- "your fandoms". */
export function hubsForGames(gameIds) {
  const slugs = new Set();
  for (const g of games) if (gameIds.includes(g.id)) slugs.add(g.franchise);
  return [...slugs].map((s) => hubs.get(s)).filter(Boolean);
}

/**
 * Hacker News style decay: a post needs either fresh votes or recency to sit
 * near the top, so an old popular thread cannot hold the front page forever.
 */
export function hotScore({ upvotes, createdAt }, now = Date.now()) {
  const ageHours = Math.max(0, (now - createdAt) / 36e5);
  return (upvotes + 1) / Math.pow(ageHours + 2, 1.5);
}
