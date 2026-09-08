/**
 * Content-based recommender.
 *
 * Why content-based: on day one there is no co-play data to mine, so
 * collaborative filtering has nothing to work with. Tag overlap works from
 * the very first pick, and -- more importantly -- it is explainable, which is
 * what makes a recommendation feel trustworthy instead of arbitrary.
 */
import { games, byId, cosine, sharedFeatures, idf, genreKeys, publicGame } from './catalog.js';

/** Multiplier for a candidate that shares no genre with the user's likes. */
const CROSS_GENRE_PENALTY = 0.74;

/** How much each feedback signal moves the taste vector. */
export const SIGNAL_WEIGHT = {
  love: 1.0,
  wishlist: 0.5,
  played: 0.25,
  meh: -0.7,
};

/**
 * Build a taste vector from feedback rows.
 * Negative weights stay in the vector so that disliked tags actively push
 * candidates down rather than merely failing to lift them.
 */
export function buildTaste(rows) {
  const v = new Map();
  const sources = [];
  const genres = new Set();
  let positiveMass = 0;

  for (const { game_id, signal } of rows) {
    const game = byId.get(game_id);
    if (!game) continue; // catalog changed under an old row; skip quietly
    const w = SIGNAL_WEIGHT[signal] ?? 0;
    if (w === 0) continue;
    if (w > 0) {
      positiveMass += w;
      sources.push({ game, weight: w });
      for (const k of genreKeys(game)) genres.add(k);
    }
    for (const [f, x] of game.vector) v.set(f, (v.get(f) ?? 0) + w * x);
  }

  let norm = 0;
  for (const w of v.values()) norm += w * w;
  norm = Math.sqrt(norm) || 1;
  for (const [f, w] of v) v.set(f, w / norm);

  return { vector: v, sources, genres, positiveMass, isEmpty: v.size === 0 };
}

/**
 * Raw scores sit in a narrow band (~0.2-0.7), which reads as a bad match to a
 * human even when it is a strong one. This curve stretches it into a readable
 * 0-100. It is monotonic, so it never reorders anything -- and it is fed the
 * same blended score used for ranking, so the numbers on screen always
 * descend down the page. A list showing 77% below 75% looks broken.
 */
const displayMatch = (score) => Math.round(100 * Math.pow(Math.max(0, Math.min(1, score)), 0.55));

const TAG_LABEL = {
  fps: 'first-person shooting', pvp: 'player vs player', pve: 'co-op vs AI',
  f2p: 'free to play', 'souls-like': 'soulslike', jrpg: 'JRPG', rts: 'real-time strategy',
  aaa: 'big-budget', '2d': '2D', '3d': '3D', '4x': '4X empire building',
};
export const label = (t) => TAG_LABEL[t] ?? t.replace(/-/g, ' ');

/**
 * @param rows      feedback rows for this user
 * @param limit     how many recommendations to return
 * @param exclude   extra game ids to keep out (e.g. already shown)
 */
export function recommend(rows, { limit = 12, exclude = [] } = {}) {
  const taste = buildTaste(rows);
  if (taste.isEmpty) return { items: [], taste };

  const seen = new Set([...rows.map((r) => r.game_id), ...exclude]);

  const scored = [];
  for (const g of games) {
    if (seen.has(g.id)) continue;
    const cos = cosine(taste.vector, g.vector);
    if (cos <= 0) continue;
    // Quality prior: a strong tag match on a poorly reviewed game is still a
    // risky pick. Popularity is a light tie-break only -- weighted any harder
    // it would bury exactly the niche recommendations people come here for.
    const quality = 0.88 + 0.12 * (g.rating / 100);
    const familiarity = 0.97 + 0.03 * (g.pop / 100);
    // A game sharing no genre at all with anything the user likes is a bigger
    // leap. Penalise it rather than exclude it -- cross-genre picks are how
    // people find something new, they just shouldn't outrank the obvious ones.
    const sameGenre = genreKeys(g).some((k) => taste.genres.has(k));
    const reach = sameGenre ? 1 : CROSS_GENRE_PENALTY;
    scored.push({ game: g, cos, score: cos * quality * familiarity * reach });
  }
  scored.sort((a, b) => b.score - a.score);

  // Greedy diversification: one game per franchise, and penalise candidates
  // that mostly repeat what has already been picked. Without this the whole
  // feed becomes six flavours of the same shooter.
  const picked = [];
  const usedFranchise = new Set();
  const pool = scored.slice(0, limit * 8);

  while (picked.length < limit && pool.length) {
    let bestIdx = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (usedFranchise.has(c.game.franchise)) continue;
      let redundancy = 0;
      for (const p of picked) redundancy = Math.max(redundancy, cosine(p.game.vector, c.game.vector));
      const val = c.score - 0.22 * redundancy;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    if (bestIdx === -1) break;
    const [chosen] = pool.splice(bestIdx, 1);
    usedFranchise.add(chosen.game.franchise);
    picked.push(chosen);
  }

  const items = picked.map(({ game, score }) => {
    // Attribute the match to the single liked game that best explains it.
    let best = null;
    for (const s of taste.sources) {
      const sim = cosine(s.game.vector, game.vector) * s.weight;
      if (!best || sim > best.sim) best = { sim, game: s.game };
    }
    const reasonTags = best ? sharedFeatures(best.game, game) : [];
    return {
      // publicGame, not a spread of the internal object: the spread skipped
      // the cover URL and leaked the internal popularity score.
      ...publicGame(game),
      match: displayMatch(score),
      because: best ? { id: best.game.id, title: best.game.title } : null,
      reasons: reasonTags.map(label),
    };
  });

  // Diversification picks *which* games appear; match order decides how they
  // are presented, so the percentages read top to bottom.
  items.sort((a, b) => b.match - a.match);

  return { items, taste };
}

/** Top tags in a taste vector, as bar-chart friendly percentages. */
export function tasteProfile(rows, limit = 8) {
  const { vector, sources, isEmpty } = buildTaste(rows);
  if (isEmpty) return { top: [], genres: [], seeds: [] };

  const tags = [];
  const genres = [];
  for (const [f, w] of vector) {
    if (w <= 0) continue;
    (f.startsWith('genre:') ? genres : tags).push([f, w]);
  }
  const toPct = (list, n) => {
    const top = list.sort((a, b) => b[1] - a[1]).slice(0, n);
    const max = top[0]?.[1] || 1;
    return top.map(([f, w]) => ({
      key: f.replace(/^genre:/, ''),
      label: label(f.replace(/^genre:/, '')),
      strength: Math.round((w / max) * 100),
    }));
  };
  return {
    top: toPct(tags, limit),
    genres: toPct(genres, 4),
    seeds: sources.sort((a, b) => b.weight - a.weight).slice(0, 6)
      .map((s) => ({ id: s.game.id, title: s.game.title })),
  };
}

/** Your match with one specific game -- the same number the feed shows. */
export function gameMatch(rows, game) {
  const taste = buildTaste(rows);
  if (taste.isEmpty) return null;
  const cos = Math.max(0, cosine(taste.vector, game.vector));
  const quality = 0.88 + 0.12 * (game.rating / 100);
  const familiarity = 0.97 + 0.03 * (game.pop / 100);
  const sameGenre = genreKeys(game).some((k) => taste.genres.has(k));
  return displayMatch(cos * quality * familiarity * (sameGenre ? 1 : CROSS_GENRE_PENALTY));
}

/* ------------------------- reviewer taste matching ------------------------ */

/**
 * How alike two people's tastes are, 0-100.
 *
 * This is the number that makes a review worth reading: "82% taste match"
 * tells you far more about whether to trust a verdict than a star average
 * from strangers does.
 */
export function matchBetween(rowsA, rowsB) {
  const a = buildTaste(rowsA);
  const b = buildTaste(rowsB);
  if (a.isEmpty || b.isEmpty) return null;
  return displayMatch(Math.max(0, cosine(a.vector, b.vector)));
}

/**
 * The public shape of someone's taste, shown beside their review.
 * Deliberately narrow: their strongest tags and at most three games they
 * love. Posting a review is the opt-in for showing this.
 */
export function tasteSummary(rows, { games: gameLimit = 3, tags: tagLimit = 3 } = {}) {
  const profile = tasteProfile(rows, tagLimit);
  return {
    loves: profile.seeds.slice(0, gameLimit).map((s) => s.title),
    tags: profile.top.slice(0, tagLimit).map((t) => t.label),
  };
}

/**
 * Verdict split among reviewers, overall and among people who actually share
 * the viewer's taste. The gap between those two numbers is the whole point of
 * the product.
 */
export function verdictSplit(reviews, { matchFloor = 55, minSample = 3 } = {}) {
  const tally = (list, floor) => {
    if (list.length < floor) return null;
    const yes = list.filter((r) => r.verdict === 'recommend').length;
    return { count: list.length, recommend: Math.round((yes / list.length) * 100) };
  };
  const matched = reviews.filter((r) => typeof r.tasteMatch === 'number' && r.tasteMatch >= matchFloor);
  return {
    overall: tally(reviews, 1),
    // "100% of players like you recommend this" off a single review is a lie
    // dressed as a statistic. Withhold the aggregate until it means something.
    likeYou: tally(matched, minSample),
    matchedCount: matched.length,
    matchFloor,
    minSample,
  };
}

/** Discourage a single tag from dominating: used by the "surprise me" mode. */
export function wildcard(rows, { limit = 4 } = {}) {
  const { items } = recommend(rows, { limit: 40 });
  return items.slice(12).sort(() => Math.random() - 0.5).slice(0, limit);
}

export { idf };
