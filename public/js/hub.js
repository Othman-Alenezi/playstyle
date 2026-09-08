/**
 * One fandom hub: posts, upvotes and comments for a franchise.
 * Comments load on demand when a thread is expanded, so a hub with fifty
 * posts is one request rather than fifty-one.
 */
import { api, ApiError } from './api.js';
import { $, el, render, cover, toast, navItems, skeletonRecs } from './ui.js';

const TITLE_MIN = 4;
const POST_MIN = 20;

const slug = decodeURIComponent(location.pathname.split('/fandom/')[1] ?? '');

let user = null;
let hub = null;
let posts = [];
let sort = 'hot';
let joined = false;
let memberCount = 0;
const openThreads = new Set();

const ago = (ts) => {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

/* --------------------------------- header --------------------------------- */

function paintHead() {
  const joinBtn = el('button', {
    class: joined ? 'btn' : 'btn btn--primary', type: 'button',
    text: joined ? 'Leave fandom' : 'Join fandom',
    onclick: async (e) => {
      if (!user) { location.href = '/auth'; return; }
      const btn = e.currentTarget;
      btn.dataset.loading = 'true';
      try {
        const res = await api.joinHub(hub.slug, joined);
        joined = res.joined;
        memberCount = res.memberCount;
        paintHead();
        toast(joined ? `Joined ${hub.name}` : `Left ${hub.name}`, { duration: 2600 });
      } catch (err) {
        delete btn.dataset.loading;
        toast(err.message, { error: true });
      }
    },
  });

  render($('#hubhead'), el('div', { class: 'hubhead' }, [
    el('div', { class: 'hubhead__top' }, [
      el('div', { class: 'hubhead__grow' }, [
        el('p', { class: 'hubcard__stats' }, [el('a', { href: '/fandoms', text: '← All fandoms' })]),
        el('h1', { text: hub.name }),
        el('p', { class: 'hubhead__sub', text:
          `${memberCount} member${memberCount === 1 ? '' : 's'} · `
          + `${posts.length} post${posts.length === 1 ? '' : 's'} · `
          + hub.tags.slice(0, 3).map((t) => t.replace(/-/g, ' ')).join(', ') }),
      ]),
      joinBtn,
    ]),
    el('div', { class: 'hubhead__games' }, hub.games.map((g) =>
      el('a', { class: 'hubhead__game', href: `/game/${encodeURIComponent(g.id)}` }, [
        cover(g, { year: false }),
        el('span', { text: g.title }),
      ]))),
  ]));
  document.title = `${hub.name} — Playstyle`;
}

/* -------------------------------- composer -------------------------------- */

function paintCompose() {
  if (!user) {
    render($('#compose'), el('div', { class: 'compose' }, [
      el('p', { text: `Got something to say to ${hub.name} fans?` }),
      el('p', { class: 'split__note', text: 'Your posts show your taste profile, so people can see whether you actually play this kind of game.' }),
      el('p', { class: 'compose__foot' }, [
        el('a', { class: 'btn btn--primary', href: '/auth?mode=signup', text: 'Create a free account' }),
        el('a', { class: 'btn', href: '/auth', text: 'Sign in' }),
      ]),
    ]));
    return;
  }

  const title = el('input', { class: 'input', id: 'post-title', type: 'text', maxlength: '140',
    placeholder: 'Title — what is this about?', 'aria-label': 'Post title' });
  const body = el('textarea', { class: 'textarea', id: 'post-body',
    placeholder: 'Say your piece.', 'aria-label': 'Post body', 'aria-describedby': 'post-error' });
  const errorSlot = el('span', { class: 'field__error', id: 'post-error' });
  const submit = el('button', { class: 'btn btn--primary', type: 'submit', text: 'Post to ' + hub.name });

  for (const input of [title, body]) {
    input.addEventListener('input', () => {
      errorSlot.textContent = '';
      input.setAttribute('aria-invalid', 'false');
    });
  }

  const form = el('form', { class: 'compose', novalidate: true }, [
    el('h2', { class: 'gate__title', text: 'Start a discussion' }),
    title,
    el('div', { style: { height: 'var(--s-3)' } }),
    body,
    errorSlot,
    el('div', { class: 'compose__foot' }, [el('span', { class: 'compose__spacer' }), submit]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const t = title.value.trim();
    const b = body.value.trim();
    if (t.length < TITLE_MIN) {
      errorSlot.textContent = `Give it a title of at least ${TITLE_MIN} characters.`;
      title.setAttribute('aria-invalid', 'true'); title.focus(); return;
    }
    if (b.length < POST_MIN) {
      errorSlot.textContent = `Write at least ${POST_MIN} characters — ${POST_MIN - b.length} to go.`;
      body.setAttribute('aria-invalid', 'true'); body.focus(); return;
    }
    submit.dataset.loading = 'true';
    try {
      await api.createPost(hub.slug, { title: t, body: b });
      title.value = ''; body.value = '';
      sort = 'new'; // so the thing they just wrote is the first thing they see
      toast('Posted');
      await load();
    } catch (err) {
      delete submit.dataset.loading;
      errorSlot.textContent = err instanceof ApiError && err.fields
        ? (err.fields.title || err.fields.body || err.message)
        : err.message;
    }
  });

  render($('#compose'), form);
}

/* --------------------------------- posts ---------------------------------- */

function postCard(p) {
  const voteBtn = el('button', {
    class: 'post__votebtn', type: 'button', text: '▲',
    'aria-label': p.author.isMe ? 'You cannot upvote your own post' : `Upvote: ${p.title}`,
    'aria-pressed': String(p.myVote),
    disabled: p.author.isMe,
    onclick: async (e) => {
      if (!user) { location.href = '/auth'; return; }
      const btn = e.currentTarget;
      // Optimistic: the count moves immediately, the request catches up.
      const wasVoted = p.myVote;
      p.myVote = !wasVoted;
      p.upvotes += wasVoted ? -1 : 1;
      btn.setAttribute('aria-pressed', String(p.myVote));
      btn.parentElement.querySelector('.post__score').textContent = String(p.upvotes);
      try {
        await api.votePost(p.id, !wasVoted);
      } catch (err) {
        p.myVote = wasVoted;
        p.upvotes += wasVoted ? 1 : -1;
        btn.setAttribute('aria-pressed', String(p.myVote));
        btn.parentElement.querySelector('.post__score').textContent = String(p.upvotes);
        toast(err.message, { error: true });
      }
    },
  });

  const threadHost = el('div', { class: 'comments', hidden: !openThreads.has(p.id) });
  if (openThreads.has(p.id)) loadComments(p, threadHost);

  const toggle = el('button', {
    class: 'act', type: 'button',
    'aria-expanded': String(openThreads.has(p.id)),
    text: `${p.commentCount} comment${p.commentCount === 1 ? '' : 's'}`,
    onclick: (e) => {
      const open = !openThreads.has(p.id);
      if (open) openThreads.add(p.id); else openThreads.delete(p.id);
      threadHost.hidden = !open;
      e.currentTarget.setAttribute('aria-expanded', String(open));
      if (open) loadComments(p, threadHost);
    },
  });

  const taste = p.author.taste;
  return el('article', { class: p.author.isMe ? 'post post--mine' : 'post' }, [
    el('div', { class: 'post__vote' }, [voteBtn, el('span', { class: 'post__score', text: String(p.upvotes) })]),
    el('div', { style: { 'min-width': '0' } }, [
      el('h3', { class: 'post__title', text: p.title }),
      el('p', { class: 'post__by' }, [
        el('strong', { text: p.author.isMe ? `${p.author.username} (you)` : p.author.username }),
        typeof p.tasteMatch === 'number' && !p.author.isMe
          ? el('span', {}, [' ', el('span', { class: 'matchpill', text: `${p.tasteMatch}% match` })])
          : null,
        el('span', { text: taste.loves.length ? ` · loves ${taste.loves.slice(0, 2).join(', ')}` : '' }),
        el('span', { text: ` · ${ago(p.createdAt)}` }),
      ]),
      el('p', { class: 'post__body', text: p.body }),
      el('div', { class: 'post__foot' }, [
        toggle,
        p.author.isMe
          ? el('button', { class: 'act act--meh', type: 'button', text: 'Delete', onclick: async () => {
              try { await api.deletePost(p.id); toast('Post deleted'); await load(); }
              catch (err) { toast(err.message, { error: true }); }
            } })
          : null,
      ]),
      threadHost,
    ]),
  ]);
}

async function loadComments(p, host) {
  render(host, el('p', { class: 'comment__body', text: 'Loading…' }));
  try {
    const { items } = await api.comments(p.id);
    const nodes = items.map((c) => el('div', { class: 'comment' }, [
      el('p', { class: 'comment__who' }, [
        el('strong', { text: c.author.isMe ? `${c.author.username} (you)` : c.author.username }),
        typeof c.tasteMatch === 'number' && !c.author.isMe
          ? el('span', {}, [' ', el('span', { class: 'matchpill', text: `${c.tasteMatch}%` })])
          : null,
        el('span', { text: c.author.taste.loves.length ? ` · loves ${c.author.taste.loves.join(', ')}` : '' }),
        el('span', { text: ` · ${ago(c.createdAt)}` }),
        c.author.isMe
          ? el('button', { class: 'toast__action', type: 'button', text: 'Delete', onclick: async () => {
              try { await api.deleteComment(c.id); await load(); }
              catch (err) { toast(err.message, { error: true }); }
            } })
          : null,
      ]),
      el('p', { class: 'comment__body', text: c.body }),
    ]));

    if (user) {
      const input = el('input', { class: 'input', type: 'text', maxlength: '2000',
        placeholder: 'Add a comment…', 'aria-label': `Comment on ${p.title}` });
      const send = el('button', { class: 'btn', type: 'submit', text: 'Reply' });
      const form = el('form', { class: 'comment__form' }, [input, send]);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (text.length < 2) { input.focus(); return; }
        send.dataset.loading = 'true';
        try {
          await api.addComment(p.id, text);
          input.value = '';
          p.commentCount += 1;
          await loadComments(p, host);
        } catch (err) {
          delete send.dataset.loading;
          toast(err.message, { error: true });
        }
      });
      nodes.push(form);
    } else {
      nodes.push(el('p', { class: 'comment__who' }, [
        el('a', { href: '/auth', text: 'Sign in' }), ' to reply.',
      ]));
    }

    render(host, nodes.length ? nodes : el('p', { class: 'comment__body', text: 'No comments yet.' }));
  } catch (err) {
    render(host, el('p', { class: 'comment__body', text: err.message }));
  }
}

/* ---------------------------------- load ---------------------------------- */

async function load() {
  try {
    const data = await api.hub(slug, sort);
    hub = data.hub;
    posts = data.posts;
    sort = data.sort;
    joined = data.joined;
    memberCount = data.memberCount;

    paintHead();
    paintCompose();

    $('#sortbar').hidden = posts.length < 2;
    render($('#sort-options'), [
      { key: 'hot', label: 'Hot' }, { key: 'new', label: 'New' }, { key: 'top', label: 'Top' },
    ].map(({ key, label }) => {
      const chip = el('button', {
        class: 'chip chip--button', type: 'button', text: label,
        'aria-pressed': sort === key ? 'true' : 'false',
      });
      chip.addEventListener('click', async () => { sort = key; await load(); });
      return chip;
    }));

    render($('#posts'), posts.length
      ? el('div', { class: 'posts' }, posts.map(postCard))
      : el('div', { class: 'card empty' }, [
          el('div', { class: 'empty__icon', 'aria-hidden': 'true', text: '◇' }),
          el('h3', { class: 'empty__title', text: `No posts in ${hub.name} yet` }),
          el('p', { class: 'empty__body', text: 'This hub is brand new. Whatever you post is the first thing anyone here reads.' }),
        ]));
  } catch (err) {
    render($('#hubhead'), el('div', { class: 'card empty' }, [
      el('h1', { class: 'empty__title', text: 'Fandom not found' }),
      el('p', { class: 'empty__body', text: err.message }),
      el('a', { class: 'btn btn--primary', href: '/fandoms', text: 'Browse all fandoms' }),
    ]));
    render($('#posts'), []);
  }
}

async function boot() {
  render($('#posts'), skeletonRecs(2));
  try { user = (await api.me()).user; } catch { user = null; }
  render($('#site-nav'), navItems(user, {
    onSignOut: async () => { await api.logout(); location.reload(); },
  }));
  await load();
}

boot();
