/**
 * Second pass for games Steam does not carry -- console exclusives, and
 * storefront-exclusive titles like Valorant or Fortnite.
 *
 * Wikipedia's pageimages endpoint only returns freely-licensed files, and
 * box art is not one, so instead we list a page's files and take one whose
 * *name* says it is cover art. Anything ambiguous is skipped: a screenshot or
 * a photo of a developer would be worse than the generated cover.
 *
 * Run: node scripts/fetch-missing-covers.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'covers');
const MANIFEST = join(ROOT, 'data', 'covers.json');
const API = 'https://en.wikipedia.org/w/api.php';

/** Wikipedia article titles where the game's name alone is ambiguous. */
const ARTICLE = {
  'control': 'Control (video game)',
  'minecraft': 'Minecraft',
  'roblox': 'Roblox',
  'fortnite': 'Fortnite',
  'valorant': 'Valorant',
  'gta-online': 'Grand Theft Auto Online',
  'wow': 'World of Warcraft',
  'mario-kart-world': 'Mario Kart 8 Deluxe',
  'pokemon-sv': 'Pokémon Scarlet and Violet',
  'starcraft-2': 'StarCraft II: Wings of Liberty',
  'tarkov': 'Escape from Tarkov',
  'lego-fortnite': 'Lego Fortnite',
  'death-stranding-2': 'Death Stranding 2: On the Beach',
  'astro-bot': 'Astro Bot',
  'uncharted-4': "Uncharted 4: A Thief's End",
};

const COVERISH = /(cover|box.?art|boxart)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'playstyle-student-project/1.0 (educational use)';

/**
 * Wikipedia rate-limits hard: a first run without pacing got two results and
 * then 429 for everything else. Requests are serial with a delay, and a 429
 * backs off and retries rather than giving up on the game.
 */
const api = async (params, attempt = 0) => {
  const url = `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 && attempt < 4) {
    await sleep(3000 * (attempt + 1));
    return api(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`wikipedia ${res.status}`);
  await sleep(900);
  return res.json();
};

async function findCoverFile(title) {
  const data = await api({ action: 'query', titles: title, prop: 'images', imlimit: '60', redirects: '1' });
  const pages = Object.values(data?.query?.pages ?? {});
  const files = pages.flatMap((p) => (p.images ?? []).map((i) => i.title));
  return files.find((f) => COVERISH.test(f) && /\.(jpe?g|png)$/i.test(f)) ?? null;
}

async function fileUrl(fileTitle) {
  const data = await api({ action: 'query', titles: fileTitle, prop: 'imageinfo', iiprop: 'url', iiurlwidth: '600' });
  const page = Object.values(data?.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  return info?.thumburl || info?.url || null;
}

const games = JSON.parse(readFileSync(join(ROOT, 'data', 'games.json'), 'utf8'));
const have = new Set(readdirSync(OUT).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)));
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const missing = games.filter((g) => !have.has(g.id));

console.log(`${missing.length} games without art. Looking for cover files on Wikipedia…\n`);
let got = 0;
for (const g of missing) {
  const title = ARTICLE[g.id] ?? g.title;
  try {
    const file = await findCoverFile(title);
    if (!file) { console.log(`  -  ${g.title}`); continue; }
    const url = await fileUrl(file);
    if (!url) { console.log(`  -  ${g.title}`); continue; }
    const img = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!img.ok) { console.log(`  x  ${g.title}`); continue; }
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 4000) { console.log(`  x  ${g.title} (too small)`); continue; }
    writeFileSync(join(OUT, `${g.id}.jpg`), buf);
    manifest[g.id] = { source: 'wikipedia', url };
    got++;
    console.log(`  ok ${g.title.padEnd(44)} ${file}`);
  } catch (err) {
    console.log(`  !  ${g.title}: ${err.message}`);
  }
  await sleep(600);
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 0));
const total = readdirSync(OUT).filter((f) => f.endsWith('.jpg')).length;
console.log(`\nAdded ${got}. Coverage now ${total}/${games.length}.`);
