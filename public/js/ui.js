/** Shared UI helpers: DOM building, generated cover art, toasts, header. */
import { theme } from './store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Build an element. Text is always set via textContent, never innerHTML. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') throw new Error('innerHTML is not allowed here');
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) node.style.setProperty(p, x);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [children].flat()) if (c) node.append(c.nodeType ? c : document.createTextNode(String(c)));
  return node;
}

/* ------------------------------ cover art -------------------------------- */

/**
 * Cover colour is derived from the game's primary genre, with a small
 * per-game offset. Two things fall out of that: a genre reads as a colour
 * family across the whole app, and two shooters sitting next to each other
 * look related on purpose instead of looking like a colour clash.
 */
const GENRE_HUE = {
  'Shooter': 352, 'Fighting': 8, 'Action Adventure': 22, 'Adventure': 40,
  'Sports': 84, 'Sandbox': 100, 'Platformer': 118, 'Survival': 140,
  'Roguelike': 158, 'Simulation': 176, 'Puzzle': 192, 'Racing': 204,
  'Strategy': 220, 'MMO': 236, 'Metroidvania': 248, 'Action RPG': 262,
  'Action': 272, 'RPG': 284, 'Horror': 300, 'JRPG': 314, 'Party': 332,
};
const DEFAULT_HUE = 262;

const hashOf = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h;
};

export function hueOf(game) {
  // Accepts a game object, or a bare id for callers that only have one.
  const id = typeof game === 'string' ? game : game.id;
  const genre = typeof game === 'string' ? null : game.genres?.[0];
  const base = GENRE_HUE[genre] ?? DEFAULT_HUE;
  const spread = (hashOf(id) % 15) - 7; // +/- 7 degrees so siblings still differ
  return (base + spread + 360) % 360;
}

export function cover(game, { year = true } = {}) {
  const node = el('div', { class: 'cover', style: { '--h': String(hueOf(game)) }, 'aria-hidden': 'true' }, [
    el('span', { class: 'cover__title', text: game.title }),
    year && game.year ? el('span', { class: 'cover__year', text: String(game.year) }) : null,
  ]);

  if (game.cover) {
    const img = el('img', {
      class: 'cover__img', src: game.cover, alt: '',
      loading: 'lazy', decoding: 'async',
    });
    // If the file is missing or corrupt, drop back to the generated cover
    // rather than showing a broken-image box.
    img.addEventListener('error', () => { img.remove(); node.classList.remove('cover--art'); });
    node.classList.add('cover--art');
    node.prepend(img);
  }
  return node;
}

/* -------------------------------- ring ----------------------------------- */

export function matchRing(pct) {
  const ring = el('div', {
    class: pct >= 75 ? 'ring ring--strong' : 'ring',
    role: 'img', 'aria-label': `${pct} percent taste match`,
  }, [el('span', { class: 'ring__value', text: `${pct}` })]);
  // Animate from zero on insert so the number feels earned.
  requestAnimationFrame(() => ring.style.setProperty('--pct', String(pct)));
  return ring;
}

/* -------------------------------- toasts --------------------------------- */

let toastHost = null;
export function toast(message, { action, actionLabel, error = false, duration = 5000 } = {}) {
  if (!toastHost) {
    toastHost = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const node = el('div', { class: error ? 'toast toast--error' : 'toast' }, [
    el('span', { class: 'toast__text', text: message }),
    action ? el('button', {
      class: 'toast__action', type: 'button', text: actionLabel || 'Undo',
      onclick: () => { action(); dismiss(); },
    }) : null,
  ]);
  const dismiss = () => {
    if (!node.isConnected) return;
    node.dataset.leaving = 'true';
    setTimeout(() => node.remove(), 160);
  };
  toastHost.append(node);
  setTimeout(dismiss, duration);
  return dismiss;
}

/* ------------------------------- skeletons ------------------------------- */

export function skeletonRecs(n = 4) {
  return el('div', { class: 'recs' }, Array.from({ length: n }, () =>
    el('div', { class: 'rec' }, [
      el('div', { class: 'skeleton', style: { 'aspect-ratio': '3 / 4', 'border-radius': '12px' } }),
      el('div', { class: 'rec__body' }, [
        el('div', { class: 'skeleton', style: { height: '20px', width: '55%' } }),
        el('div', { class: 'skeleton', style: { height: '13px', width: '30%' } }),
        el('div', { class: 'skeleton', style: { height: '44px' } }),
        el('div', { class: 'skeleton', style: { height: '30px', width: '70%' } }),
      ]),
    ])));
}

/* -------------------------------- header --------------------------------- */

export function themeToggle() {
  const btn = el('button', {
    class: 'btn btn--ghost btn--icon', type: 'button',
    'aria-label': 'Switch between light and dark theme', title: 'Toggle theme',
    text: theme.current() === 'dark' ? '◑' : '◐',
  });
  btn.addEventListener('click', () => {
    btn.textContent = theme.toggle() === 'dark' ? '◑' : '◐';
  });
  return btn;
}

export function logo(href = '/') {
  return el('a', { class: 'logo', href, 'aria-label': 'Playstyle home' }, [
    el('span', { class: 'logo__mark' }),
    el('span', { text: 'Playstyle' }),
  ]);
}

/**
 * The nav contents for the shared header. `user` null means signed out.
 * Returned as an array so a page can drop it into its existing <nav>.
 */
export function navItems(user, { onSignOut } = {}) {
  return [
    themeToggle(),
    el('a', { class: 'btn btn--ghost', href: '/fandoms', text: 'Fandoms', 'data-nav-optional': true }),
    ...(user
      ? [
          el('a', { class: 'btn btn--ghost', href: '/app', text: 'My matches', 'data-nav-optional': true }),
          el('button', {
            class: 'btn', type: 'button', text: 'Sign out',
            onclick: async (e) => {
              e.currentTarget.dataset.loading = 'true';
              try { await onSignOut?.(); } finally { delete e.currentTarget.dataset.loading; }
            },
          }),
        ]
      : [
          el('a', { class: 'btn btn--ghost', href: '/auth', text: 'Sign in' }),
          el('a', { class: 'btn btn--primary', href: '/auth?mode=signup', text: 'Create account' }),
        ]),
  ];
}

/** Replace a container's children in one operation. */
export function render(host, ...nodes) {
  host.replaceChildren(...nodes.flat().filter(Boolean));
}
