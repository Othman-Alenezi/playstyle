/**
 * Downloads cover art for the catalog from Steam's public CDN.
 *
 * Run with `npm run covers`. Optional and reproducible: if it has never been
 * run, every game falls back to the generated gradient cover, and the app
 * works exactly the same.
 *
 * Lookup uses Steam's public store search -- no API key. Each result's name
 * is checked against the title we asked for and anything ambiguous is skipped
 * rather than guessed, because a wrong cover is worse than no cover. Console
 * exclusives (Mario, Zelda, Splatoon) are not on Steam and keep generated art.
 *
 * The images are copyrighted promotional art, downloaded for local use in a
 * student project. They are gitignored.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const OUT = join(ROOT, 'public', 'covers');
const SEARCH = 'https://store.steampowered.com/api/storesearch/';
const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

/** Portrait capsule first -- it matches the 3:4 cover boxes in the UI. */
const VARIANTS = ['library_600x900_2x.jpg', 'library_600x900.jpg', 'header.jpg'];

const norm = (s) => s
  .toLowerCase()
  .replace(/[™®©]/g, '')
  .replace(/&/g, 'and')
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Progressively looser forms of a title to try against the index. */
function candidates(title) {
  const out = [title];
  if (title.includes(':')) {
    out.push(title.split(':')[0].trim());                 // "Fallout: New Vegas" -> "Fallout"
    out.push(title.replace(':', '').trim());
  }
  out.push(title.replace(/\bremake\b/i, '').trim());
  out.push(title.replace(/\b(deluxe|definitive|legendary|royal|complete)\b.*$/i, '').trim());
  out.push(title.replace(/\s+(19|20)\d\d$/, '').trim());   // "EA Sports FC 25" -> "EA Sports FC"
  return [...new Set(out.filter(Boolean))];
}

/**
 * Games the store search cannot find by name, usually because their Steam
 * listing is named differently (Control is sold as "Control Ultimate
 * Edition", Uncharted 4 as part of a collection) or because search ranks a
 * spin-off above the base game. Each id is still verified against the store
 * before use, so a wrong number here fails safe.
 */
const OVERRIDES = {
  'witcher-3': 292030,
  'disco-elysium': 632470,
  'control': 870780,
  'overwatch-2': 2357570,
  'football-manager-25': 2252570,
  'spiritfarer': 972660,
  'rocket-league': 252950,
  'alan-wake-2': 2707530,
  'uncharted-4': 1659420,
  'cod-bo6': 2933620,
  'cod-mw3': 1938090,
};

/** Confirm an overridden id really is the game we think it is. */
async function verifyAppId(appid, title) {
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`);
    if (!res.ok) return false;
    const json = await res.json();
    const entry = json?.[String(appid)];
    if (!entry?.success || !entry.data?.name) return false;
    return similarity(title, entry.data.name) >= 0.45;
  } catch { return false; }
}

/** Word-overlap similarity, so "ELDEN RING" matches "Elden Ring". */
function similarity(a, b) {
  const wa = new Set(norm(a).split(' ').filter(Boolean));
  const wb = new Set(norm(b).split(' ').filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.max(wa.size, wb.size);
}

/**
 * Find a game's Steam id. Tries the full title first, then looser forms, and
 * only accepts a result whose name genuinely resembles what we asked for.
 */
async function findAppId(title, id) {
  if (OVERRIDES[id]) {
    const appid = OVERRIDES[id];
    if (await verifyAppId(appid, title)) return { appid, name: title, score: 1 };
    console.log(`\n  override for ${id} (appid ${appid}) failed verification, skipping`);
  }
  for (const candidate of candidates(title)) {
    const url = `${SEARCH}?term=${encodeURIComponent(candidate)}&cc=us&l=en`;
    let json;
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) continue;
      json = await res.json();
    } catch { continue; }

    for (const item of (json.items ?? []).slice(0, 5)) {
      if (item.type && item.type !== 'app') continue;
      const score = similarity(title, item.name);
      // 0.6 keeps "Fallout: New Vegas" but rejects "Fallout Shelter".
      if (score >= 0.6) return { appid: item.id, name: item.name, score };
    }
  }
  return null;
}

async function download(appid, dest) {
  for (const variant of VARIANTS) {
    const res = await fetch(`${CDN}/${appid}/${variant}`);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    // A CDN miss sometimes returns a tiny placeholder rather than a 404.
    if (buf.length < 5000) continue;
    writeFileSync(dest, buf);
    return { variant, bytes: buf.length };
  }
  return null;
}

/** Run tasks with a small concurrency cap so we are polite to the CDN. */
async function pool(items, limit, worker) {
  const results = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (cursor < items.length) results.push(await worker(items[cursor++]));
  }));
  return results;
}

async function run() {
  const games = JSON.parse(readFileSync(join(ROOT, 'data', 'games.json'), 'utf8'));
  mkdirSync(OUT, { recursive: true });
  const already = new Set(readdirSync(OUT).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)));

  const todo = games.filter((g) => !already.has(g.id));
  console.log(`${already.size} already downloaded, ${todo.length} to look up.\n`);
  if (!todo.length) { report(games, []); return; }

  let ok = 0, bytes = 0;
  const unmatched = [];

  await pool(todo, 3, async (g) => {
    const match = await findAppId(g.title, g.id);
    if (!match) { unmatched.push(g); process.stdout.write('-'); return; }
    const hit = await download(match.appid, join(OUT, `${g.id}.jpg`));
    if (hit) { ok++; bytes += hit.bytes; process.stdout.write('.'); }
    else { unmatched.push(g); process.stdout.write('x'); }
  });

  console.log(`\n\nDownloaded ${ok} covers (${(bytes / 1048576).toFixed(1)} MB).`);
  report(games, unmatched);
}

function report(games, unmatched) {
  const have = new Set(readdirSync(OUT).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)));
  console.log(`\nCatalog coverage: ${have.size}/${games.length} games have real art.`);
  if (unmatched.length) {
    console.log('Using generated art (mostly console exclusives):');
    console.log('  ' + unmatched.map((g) => g.title).join(', '));
  }
}

run().catch((err) => { console.error(err.message); process.exit(1); });
