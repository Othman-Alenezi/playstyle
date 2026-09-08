/** Landing page: the guest taste quiz and its live preview. */
import { api, ApiError } from './api.js';
import { picks } from './store.js';
import { $, el, cover, render, toast, skeletonRecs, navItems } from './ui.js';
import { recCard, tasteBars } from './reccard.js';

const MIN_PICKS = 3;

const grid = $('#quiz-grid');
const dock = $('#dock');
const dockCount = $('#dock-count');
const dockGo = $('#dock-go');
const search = $('#quiz-search');
const filters = $('#quiz-filters');
const preview = $('#preview');

let catalog = [];
let selected = new Set(picks.get());
let genre = 'all';
let user = null;
/** What the server already has, so we can tell additions from removals. */
let savedLoves = new Set();

/* ------------------------------- rendering -------------------------------- */

function pickButton(game) {
  const btn = el('button', {
    class: 'pick', type: 'button', 'data-id': game.id,
    'aria-pressed': selected.has(game.id) ? 'true' : 'false',
    'aria-label': `${game.title}, ${game.genres.join(', ')}, ${game.year}`,
  }, [
    cover(game),
    el('span', { class: 'pick__check', 'aria-hidden': 'true', text: '✓' }),
    el('span', { class: 'pick__meta', text: game.genres[0] }),
  ]);
  btn.addEventListener('click', () => toggle(game.id, btn));
  return btn;
}

function visibleGames() {
  const q = search.value.trim().toLowerCase();
  return catalog.filter((g) => {
    if (genre !== 'all' && g.genres[0] !== genre) return false;
    if (!q) return true;
    return g.title.toLowerCase().includes(q) || g.tags.some((t) => t.includes(q));
  });
}

function paintGrid() {
  const list = visibleGames();
  render(grid, list.map(pickButton));
  $('#quiz-none').hidden = list.length > 0;
}

function toggle(id, btn) {
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  btn.setAttribute('aria-pressed', selected.has(id) ? 'true' : 'false');
  picks.set([...selected]);
  paintDock();
}

function paintDock() {
  const n = selected.size;
  const added = [...selected].filter((id) => !savedLoves.has(id)).length;
  const removed = [...savedLoves].filter((id) => !selected.has(id)).length;
  const changed = added + removed;

  render(dockCount, el('strong', { text: String(n) }),
    user && changed
      ? ` picked — ${added ? `${added} added` : ''}${added && removed ? ', ' : ''}${removed ? `${removed} removed` : ''}`
      : n === 0 ? ' picked'
      : n < MIN_PICKS ? ` picked — ${MIN_PICKS - n} more for a solid profile`
      : ' picked');

  // Signed in, the dock is always available: removing every pick is a valid
  // change to save, so it must not disable the button.
  dock.dataset.show = (n > 0 || (user && changed)) ? 'true' : 'false';
  dockGo.disabled = user ? changed === 0 : n < 1;
  dockGo.textContent = user
    ? (changed ? 'Save my games' : 'Saved')
    : !preview.hidden ? 'Update my matches'
    : n < MIN_PICKS && n > 0 ? `Show matches anyway (${n})`
    : 'Show my matches';
}

/* -------------------------------- preview --------------------------------- */

async function showPreview() {
  preview.hidden = false;
  render($('#preview-recs'), skeletonRecs(3));
  render($('#preview-bars'), el('div', { class: 'skeleton', style: { height: '120px' } }));
  preview.scrollIntoView({ behavior: 'smooth', block: 'start' });

  dockGo.dataset.loading = 'true';
  try {
    const { items, profile } = await api.preview([...selected], 3);
    render($('#preview-recs'), items.map((item) => recCard(item)));
    render($('#preview-bars'), tasteBars(profile));
    updateCta();
    paintDock();
    // Re-assert the scroll: swapping the skeletons for real cards can cancel
    // the smooth scroll that started before the request went out.
    preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    render($('#preview-recs'), el('div', { class: 'empty' }, [
      el('p', { class: 'empty__body', text: err instanceof ApiError ? err.message : 'Could not build your matches.' }),
      el('button', { class: 'btn', type: 'button', text: 'Try again', onclick: showPreview }),
    ]));
  } finally {
    delete dockGo.dataset.loading;
  }
}

/** Signed-in visitors get "add to my profile" instead of "create account". */
function updateCta() {
  const cta = $('#preview-cta');
  if (!user) return;
  const btn = el('button', {
    class: 'btn btn--primary btn--lg', type: 'button', id: 'preview-cta',
    text: 'Add these to my profile',
    onclick: async (e) => {
      e.currentTarget.dataset.loading = 'true';
      try {
        await api.seed([...selected]);
        picks.clear();
        location.href = '/app';
      } catch (err) {
        delete e.currentTarget.dataset.loading;
        toast(err.message, { error: true });
      }
    },
  });
  cta.replaceWith(btn);
}

/* --------------------------------- boot ----------------------------------- */

async function boot() {
  // Skeleton grid so the page never shows an empty hole.
  render(grid, Array.from({ length: 12 }, () =>
    el('div', { class: 'skeleton', style: { 'aspect-ratio': '3 / 4', 'border-radius': '12px' } })));

  const [pickerResult, meResult] = await Promise.allSettled([api.picker(), api.me()]);

  if (meResult.status === 'fulfilled' && meResult.value.user) user = meResult.value.user;
  render($('#site-nav'), navItems(user, {
    onSignOut: async () => { await api.logout(); location.reload(); },
  }));

  // Signed in: start from the games already in the profile, so this page can
  // remove picks as well as add them. Without this the grid always looked
  // empty and there was no way to take a game back out.
  if (user) {
    try {
      const { library } = await api.profile();
      savedLoves = new Set(library.filter((g) => g.signal === 'love').map((g) => g.id));
      selected = new Set(savedLoves);
      picks.set([...selected]);
    } catch { /* fall back to whatever is in local storage */ }
  }

  if (pickerResult.status === 'rejected') {
    render(grid, el('div', { class: 'empty' }, [
      el('p', { class: 'empty__body', text: 'Could not load the catalog.' }),
      el('button', { class: 'btn', type: 'button', text: 'Reload', onclick: () => location.reload() }),
    ]));
    return;
  }

  const { games, catalog: stats } = pickerResult.value;
  catalog = games;
  $('#stat-games').textContent = String(stats.games);
  $('#stat-tags').textContent = String(stats.features);
  search.placeholder = `Search ${stats.games} games…`;

  const genres = ['all', ...new Set(games.map((g) => g.genres[0]))];
  render(filters, genres.map((g) => {
    const chip = el('button', {
      class: 'chip chip--button', type: 'button',
      'aria-pressed': g === 'all' ? 'true' : 'false',
      text: g === 'all' ? 'All genres' : g,
    });
    chip.addEventListener('click', () => {
      genre = g;
      for (const c of filters.children) c.setAttribute('aria-pressed', String(c === chip));
      paintGrid();
    });
    return chip;
  }));

  paintGrid();
  paintDock();
  paintReviewHighlights();
}

/**
 * Fill the reviews feature card with real games. Silent if it fails -- it is
 * decoration on the landing page, not something worth an error state.
 */
async function paintReviewHighlights() {
  const host = $('#review-highlights');
  if (!host) return;
  try {
    const { items, reviewedGames } = await api.reviewHighlights(5);
    if (!items.length) return;
    render(host, items.map((g) => {
      const art = cover(g, { year: false });
      art.classList.add('cover--mini');
      // These sit above the fold and are 40px wide; lazy-loading them just
      // meant the row appeared half-empty on arrival.
      art.querySelector('img')?.setAttribute('loading', 'eager');
      return el('a', {
        class: 'feature__game', href: `/game/${encodeURIComponent(g.id)}`,
        title: `${g.title} — ${g.reviewCount} reviews, ${g.recommend}% recommend`,
        'aria-label': `${g.title}: ${g.reviewCount} reviews`,
      }, [art]);
    }));
    const link = $('#review-highlights-link');
    if (link && reviewedGames) {
      link.textContent = `See all ${reviewedGames} games with reviews →`;
      link.href = `/game/${encodeURIComponent(items[0].id)}`;
    }
  } catch { /* leave the card as written */ }
}

/* ------------------------------- listeners -------------------------------- */

let searchTimer;
search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(paintGrid, 130);
});
search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; paintGrid(); } });

dockGo.addEventListener('click', async () => {
  if (!user) return showPreview();
  dockGo.dataset.loading = 'true';
  try {
    const res = await api.setLibrary([...selected]);
    savedLoves = new Set(selected);
    picks.clear();
    paintDock();
    toast(
      res.added || res.removed
        ? `Saved — ${res.added} added, ${res.removed} removed`
        : 'Saved',
      { actionLabel: 'See my matches', action: () => { location.href = '/app'; } },
    );
  } catch (err) {
    toast(err.message, { error: true });
  } finally {
    delete dockGo.dataset.loading;
  }
});
$('#dock-clear').addEventListener('click', () => {
  selected.clear();
  if (!user) picks.clear();
  preview.hidden = true;
  // Update the existing buttons rather than re-rendering the grid: replacing
  // the children loses the scroll anchor and throws the page back to the top.
  for (const btn of grid.children) btn.setAttribute?.('aria-pressed', 'false');
  paintDock();
});
$('#preview-edit').addEventListener('click', () => {
  $('#quiz-grid').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
boot();
