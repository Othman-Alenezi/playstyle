/**
 * The signed-in recommendation feed.
 *
 * Every rating is optimistic: the card animates out immediately, the request
 * goes in the background, and an Undo toast covers the mistake case. Waiting
 * on a round trip for a single click is what makes a feed feel sluggish.
 */
import { api, ApiError } from './api.js';
import { $, el, render, toast, skeletonRecs, navItems } from './ui.js';
import { recCard, tasteBars } from './reccard.js';

const feed = $('#feed');
const bars = $('#bars');
const seeds = $('#seeds');

let user = null;
let items = [];

/** No keyboard hints, and no keyboard shortcut copy, on touch devices. */
const HAS_KEYBOARD = matchMedia('(pointer: fine)').matches;

const SIGNAL_COPY = {
  love: 'Added to your favourites',
  wishlist: 'Added to your wishlist',
  played: 'Marked as played',
  meh: 'Noted — less of that',
};

/* --------------------------------- render --------------------------------- */

const SIGNAL_LABEL = { love: 'Love', wishlist: 'Wishlist', played: 'Played', meh: 'Not for me' };

function paintProfile(profile) {
  render(bars, tasteBars(profile));
}

/**
 * Every game in the profile, each removable. Previously this was a read-only
 * list of chips, so a game could go into a profile and never come out.
 */
function paintLibrary(library) {
  if (!library?.length) {
    render(seeds, el('li', {}, [el('span', { class: 'rec__sub', text: 'Nothing yet.' })]));
    return;
  }
  render(seeds, library.map((g) => el('li', { class: 'mygame' }, [
    el('a', { class: 'mygame__name', href: `/game/${encodeURIComponent(g.id)}`, text: g.title }),
    el('span', { class: `mygame__signal mygame__signal--${g.signal}`, text: SIGNAL_LABEL[g.signal] ?? g.signal }),
    el('button', {
      class: 'mygame__remove', type: 'button',
      'aria-label': `Remove ${g.title} from your games`, title: 'Remove',
      text: '×',
      onclick: (e) => removeGame(g, e.currentTarget),
    }),
  ])));
}

/** Take a game back out of the profile, with an undo. */
async function removeGame(game, button) {
  button.disabled = true;
  const previousSignal = game.signal;
  try {
    await api.clearFeedback(game.id);
    await refreshProfile();
    await load({ showSkeleton: false });
    toast(`Removed ${game.title}`, {
      actionLabel: 'Undo',
      action: async () => {
        try {
          await api.feedback(game.id, previousSignal);
          await refreshProfile();
          await load({ showSkeleton: false });
        } catch (err) { toast(err.message, { error: true }); }
      },
    });
  } catch (err) {
    button.disabled = false;
    toast(err.message, { error: true });
  }
}

async function refreshProfile() {
  try {
    const { profile, library } = await api.profile();
    paintProfile(profile);
    paintLibrary(library);
  } catch { /* the feed still works without the sidebar refreshing */ }
}

function paintFeed() {
  if (!items.length) {
    render(feed, el('div', { class: 'card empty' }, [
      el('div', { class: 'empty__icon', 'aria-hidden': 'true', text: '◎' }),
      el('h2', { class: 'empty__title', text: "That's everything we'd suggest" }),
      el('p', { class: 'empty__body', text: 'You have rated your way through the list. Add a few more games you love and we will find more.' }),
      el('a', { class: 'btn btn--primary', href: '/', text: 'Add more games' }),
    ]));
    return;
  }
  render(feed, el('div', { class: 'recs' }, items.map((item, i) =>
    recCard(item, { onFeedback: rate, showKeys: i === 0 && HAS_KEYBOARD }))));
}

/* ------------------------------ interactions ------------------------------ */

async function rate(signal, item, button) {
  const card = button.closest('.rec');
  const index = items.findIndex((i) => i.id === item.id);

  // Optimistic removal.
  card.dataset.leaving = 'true';
  items = items.filter((i) => i.id !== item.id);
  setTimeout(() => { if (!items.length) paintFeed(); else card.remove(); }, 200);

  const undo = async () => {
    try {
      await api.clearFeedback(item.id);
      items.splice(Math.min(index, items.length), 0, item);
      paintFeed();
      await refreshProfile();
    } catch (err) {
      toast(err.message, { error: true });
    }
  };

  try {
    const { profile } = await api.feedback(item.id, signal);
    paintProfile(profile);
    refreshProfile();
    toast(SIGNAL_COPY[signal], { action: undo, actionLabel: 'Undo', duration: 4500 });
  } catch (err) {
    // The write failed, so put the card back rather than lying about it.
    delete card.dataset.leaving;
    items.splice(Math.min(index, items.length), 0, item);
    paintFeed();
    toast(err instanceof ApiError ? err.message : 'Could not save that rating.', { error: true });
  }
}

/** Number keys 1-4 rate the first unrated card -- fast for power users. */
function keyboardShortcuts(event) {
  if (event.target.matches('input, textarea, select')) return;
  const map = { 1: 'love', 2: 'wishlist', 3: 'played', 4: 'meh' };
  const signal = map[event.key];
  if (!signal) return;
  const first = feed.querySelector('.rec:not([data-leaving]) .act[data-signal="' + signal + '"]');
  if (first) { event.preventDefault(); first.click(); }
}

async function load({ showSkeleton = true, skipLibrary = false } = {}) {
  if (showSkeleton) {
    feed.setAttribute('aria-busy', 'true');
    render(feed, skeletonRecs(4));
    render(bars, el('div', { class: 'skeleton', style: { height: '150px' } }));
  }
  try {
    const data = await api.recommendations(12);
    if (data.needsOnboarding) {
      location.href = '/';
      return;
    }
    items = data.items;
    paintFeed();
    paintProfile(data.profile);
    if (!skipLibrary) await refreshProfile();
    // Only mention the keyboard shortcut where there is a keyboard to use.
    $('#feed-sub').textContent = items.length
      ? `${items.length} games matched to your profile. `
        + (HAS_KEYBOARD ? 'Rate the top card with keys 1-4.' : 'Rate any of them and the list updates.')
      : 'Add more games to get new suggestions.';
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) { location.href = '/auth'; return; }
    render(feed, el('div', { class: 'card empty' }, [
      el('h2', { class: 'empty__title', text: 'Could not load your matches' }),
      el('p', { class: 'empty__body', text: err.message }),
      el('button', { class: 'btn btn--primary', type: 'button', text: 'Try again', onclick: () => load() }),
    ]));
  } finally {
    feed.setAttribute('aria-busy', 'false');
  }
}

/* ---------------------------------- boot ---------------------------------- */

async function boot() {
  render(feed, skeletonRecs(4));
  let me;
  try { me = await api.me(); } catch { me = { user: null }; }
  if (!me.user) { location.href = '/auth'; return; }
  user = me.user;

  $('#feed-title').textContent = `Matches for ${user.username}`;
  render($('#site-nav'), navItems(user, {
    onSignOut: async () => { await api.logout(); location.href = '/'; },
  }));

  await load({ showSkeleton: false });
  if (HAS_KEYBOARD) document.addEventListener('keydown', keyboardShortcuts);
}

$('#refresh').addEventListener('click', async (e) => {
  e.currentTarget.dataset.loading = 'true';
  try { await load({ showSkeleton: false }); } finally { delete e.currentTarget.dataset.loading; }
});

boot();
