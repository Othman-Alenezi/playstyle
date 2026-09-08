/**
 * Guest state. The taste quiz runs before signup, so picks live in
 * localStorage until an account exists to attach them to.
 */
const KEY = 'ps.picks';

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export const picks = {
  get: () => safe(() => JSON.parse(localStorage.getItem(KEY)) || [], []),
  set: (ids) => safe(() => localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 30))), null),
  clear: () => safe(() => localStorage.removeItem(KEY), null),
  count: () => picks.get().length,
};

export const theme = {
  get: () => safe(() => localStorage.getItem('ps.theme'), null),
  set(next) {
    document.documentElement.setAttribute('data-theme', next);
    safe(() => localStorage.setItem('ps.theme', next), null);
  },
  current() {
    return document.documentElement.getAttribute('data-theme')
      || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  },
  toggle() { theme.set(theme.current() === 'dark' ? 'light' : 'dark'); return theme.current(); },
};
