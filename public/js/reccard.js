/** The recommendation card, shared by the guest preview and the signed-in feed. */
import { el, cover, matchRing } from './ui.js';

const ACTIONS = [
  { signal: 'love',     label: 'Love it',       key: '1', cls: 'act act--love' },
  { signal: 'wishlist', label: 'Wishlist',      key: '2', cls: 'act' },
  { signal: 'played',   label: 'Played it',     key: '3', cls: 'act' },
  { signal: 'meh',      label: 'Not for me',    key: '4', cls: 'act act--meh' },
];

export function recCard(item, { onFeedback = null, showKeys = false } = {}) {
  const why = item.because
    ? el('p', { class: 'rec__why' }, [
        el('span', { class: 'rec__why-label', text: 'Because you love ' }),
        el('strong', { text: item.because.title }),
        el('span', { class: 'rec__why-label', text: item.reasons.length ? ' — you both share ' : '' }),
        item.reasons.length ? el('strong', { text: item.reasons.join(', ') }) : null,
      ])
    : null;

  const actions = onFeedback
    ? el('div', { class: 'rec__actions' }, ACTIONS.map(({ signal, label, key, cls }) =>
        el('button', {
          class: cls, type: 'button', 'data-signal': signal,
          'aria-label': `${label}: ${item.title}`,
          onclick: (e) => onFeedback(signal, item, e.currentTarget),
        }, [
          el('span', { text: label }),
          showKeys ? el('span', { class: 'act__key', 'aria-hidden': 'true', text: key }) : null,
        ])))
    : null;

  const card = el('article', { class: 'rec', 'data-game': item.id }, [
    cover(item),
    el('div', { class: 'rec__body' }, [
      el('div', { class: 'rec__top' }, [
        el('div', { class: 'rec__head' }, [
          el('h3', { class: 'rec__title' }, [
            el('a', { href: `/game/${encodeURIComponent(item.id)}`, text: item.title }),
          ]),
          el('p', { class: 'rec__sub', text: `${item.genres.join(' · ')} · ${item.year}` }),
        ]),
        el('div', { class: 'rec__match' }, [
          matchRing(item.match),
          el('div', { class: 'rec__match-label', text: 'match' }),
        ]),
      ]),
      el('p', { class: 'rec__blurb', text: item.blurb }),
      why,
      el('div', { class: 'rec__tags' }, item.tags.slice(0, 5).map((t) =>
        el('span', { class: 'chip', text: t.replace(/-/g, ' ') }))),
      actions,
    ]),
  ]);
  return card;
}

/** Taste-profile bars. */
export function tasteBars(profile) {
  if (!profile?.top?.length) {
    return [el('p', { class: 'rec__sub', text: 'Rate a few games to build your profile.' })];
  }
  return profile.top.map((t) => {
    const fill = el('div', { class: 'bar__fill' });
    requestAnimationFrame(() => { fill.style.width = `${t.strength}%`; });
    return el('div', { class: 'bar' }, [
      el('div', { class: 'bar__head' }, [
        el('span', { class: 'bar__label', text: t.label }),
        el('span', { class: 'bar__pct', text: `${t.strength}%` }),
      ]),
      el('div', {
        class: 'bar__track', role: 'meter', 'aria-valuenow': t.strength,
        'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': `${t.label} strength`,
      }, [fill]),
    ]);
  });
}
