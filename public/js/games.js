/**
 * Browse the whole catalogue. This page exists so a game page is not a dead
 * end: previously the only routes to a game were the taste quiz and your own
 * recommendations, so there was no way to move between games' reviews.
 */
import { api, ApiError } from './api.js';
import { $, el, render, cover, navItems, skeletonRecs } from './ui.js';

const grid = $('#games-grid');
const search = $('#games-search');
const sortSelect = $('#games-sort');
const genreHost = $('#games-genres');
const moreBtn = $('#games-more');

const PAGE = 48;
let state = { q: '', genre: '', sort: 'reviews', offset: 0, total: 0 };
let user = null;

function gameCard(g) {
  const art = cover(g, { year: false });
  return el('a', { class: 'gamecard', href: `/game/${encodeURIComponent(g.id)}` }, [
    art,
    el('div', { class: 'gamecard__body' }, [
      el('h3', { class: 'gamecard__title', text: g.title }),
      el('p', { class: 'gamecard__meta', text: `${g.genres[0]} · ${g.year}` }),
      el('p', { class: 'gamecard__reviews', text: g.reviewCount
        ? `${g.reviewCount} review${g.reviewCount === 1 ? '' : 's'}`
        : 'No reviews yet' }),
    ]),
  ]);
}

async function load({ append = false } = {}) {
  if (!append) {
    state.offset = 0;
    render(grid, skeletonRecs(2));
  }
  moreBtn.dataset.loading = 'true';
  try {
    const params = new URLSearchParams({
      limit: String(PAGE), offset: String(state.offset), sort: state.sort,
    });
    if (state.q) params.set('q', state.q);
    if (state.genre) params.set('genre', state.genre);
    const data = await api.get(`/api/games?${params}`);

    state.total = data.total;
    const cards = data.items.map(gameCard);
    if (append) grid.append(...cards);
    else render(grid, cards);

    $('#games-none').hidden = data.total > 0;
    $('#games-sub').textContent = state.q || state.genre
      ? `${data.total} game${data.total === 1 ? '' : 's'} match. Pick one to read its reviews.`
      : `${data.total} games. Pick any one to read reviews from players who share your taste.`;

    state.offset += data.items.length;
    moreBtn.hidden = state.offset >= data.total;
    moreBtn.textContent = `Show more (${data.total - state.offset} left)`;

    if (!genreHost.children.length) paintGenres(data.genres);
  } catch (err) {
    render(grid, el('div', { class: 'card empty' }, [
      el('p', { class: 'empty__body', text: err instanceof ApiError ? err.message : 'Could not load the catalogue.' }),
      el('button', { class: 'btn', type: 'button', text: 'Try again', onclick: () => load() }),
    ]));
  } finally {
    delete moreBtn.dataset.loading;
  }
}

function paintGenres(genres) {
  render(genreHost, ['', ...genres].map((g) => {
    const chip = el('button', {
      class: 'chip chip--button', type: 'button',
      'aria-pressed': state.genre === g ? 'true' : 'false',
      text: g || 'All genres',
    });
    chip.addEventListener('click', () => {
      state.genre = g;
      for (const c of genreHost.children) c.setAttribute('aria-pressed', String(c === chip));
      load();
    });
    return chip;
  }));
}

let timer;
search.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.q = search.value.trim(); load(); }, 160);
});
search.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { search.value = ''; state.q = ''; load(); }
});
sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; load(); });
moreBtn.addEventListener('click', () => load({ append: true }));

(async function boot() {
  render(grid, skeletonRecs(2));
  try { user = (await api.me()).user; } catch { user = null; }
  render($('#site-nav'), navItems(user, {
    onSignOut: async () => { await api.logout(); location.reload(); },
  }));
  // Deep links like /games?q=call work, so search results are shareable.
  const params = new URLSearchParams(location.search);
  if (params.get('q')) { state.q = params.get('q'); search.value = state.q; }
  if (params.get('genre')) state.genre = params.get('genre');
  await load();
})();
