/** Fandom directory. Hubs tied to the viewer's own games come first. */
import { api } from './api.js';
import { $, el, render, cover, navItems, skeletonRecs } from './ui.js';

function hubCard(hub) {
  return el('article', { class: hub.joined ? 'hubcard hubcard--joined' : 'hubcard' }, [
    el('div', { class: 'hubcard__top' }, [
      el('div', { class: 'hubcard__covers' }, hub.games.map((g) => cover(g, { year: false }))),
      el('div', {}, [
        el('h3', { class: 'hubcard__name' }, [
          el('a', { href: `/fandom/${encodeURIComponent(hub.slug)}`, text: hub.name }),
        ]),
        el('p', { class: 'hubcard__stats', text:
          `${hub.postCount} post${hub.postCount === 1 ? '' : 's'} · `
          + `${hub.memberCount} member${hub.memberCount === 1 ? '' : 's'} · `
          + `${hub.gameCount} game${hub.gameCount === 1 ? '' : 's'}` }),
      ]),
    ]),
    el('div', { class: 'hubcard__tags' }, [
      hub.joined ? el('span', { class: 'chip chip--accent', text: 'Joined' }) : null,
      ...hub.tags.slice(0, 3).map((t) => el('span', { class: 'chip', text: t.replace(/-/g, ' ') })),
    ]),
  ]);
}

const emptyCard = (text) => el('div', { class: 'card empty' }, [el('p', { class: 'empty__body', text })]);

async function boot() {
  render($('#mine'), skeletonRecs(1));
  const [hubsRes, meRes] = await Promise.allSettled([api.hubs(), api.me()]);
  const user = meRes.status === 'fulfilled' ? meRes.value.user : null;
  render($('#site-nav'), navItems(user, {
    onSignOut: async () => { await api.logout(); location.reload(); },
  }));

  if (hubsRes.status === 'rejected') {
    render($('#mine'), []);
    render($('#active'), emptyCard('Could not load the fandoms.'));
    render($('#browse'), []);
    return;
  }

  const { mine, active, browse, total } = hubsRes.value;
  $('#hubs-sub').textContent = `${total} community hubs, one per franchise.`;

  $('#mine-section').hidden = !user || mine.length === 0;
  render($('#mine'), mine.map(hubCard));

  render($('#active'), active.length
    ? active.map(hubCard)
    : emptyCard('Nothing posted anywhere yet. Start a conversation in any hub.'));

  render($('#browse'), browse.map(hubCard));
  $('#browse-sub').textContent = user
    ? `Showing ${browse.length} of ${total}. Every franchise has a hub.`
    : `Showing ${browse.length} of ${total}. Sign in and we will surface the ones for games you love.`;
}

boot();
