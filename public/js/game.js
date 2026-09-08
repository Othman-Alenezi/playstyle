/**
 * Game detail page: the game, your own rating controls, and reviews ranked by
 * how closely each reviewer's taste matches yours.
 */
import { api, ApiError } from './api.js';
import { $, el, render, cover, matchRing, toast, navItems, themeToggle, skeletonRecs } from './ui.js';

const BODY_MIN = 40;
const BODY_MAX = 4000;

const VERDICTS = [
  { key: 'recommend', label: 'Recommend it' },
  { key: 'mixed', label: 'Mixed feelings' },
  { key: 'avoid', label: 'Avoid it' },
];
const VERDICT_LABEL = { recommend: 'Recommends', mixed: 'Mixed', avoid: 'Avoid' };

const SIGNALS = [
  { signal: 'love', label: 'Love it' },
  { signal: 'wishlist', label: 'Wishlist' },
  { signal: 'played', label: 'Played it' },
  { signal: 'meh', label: 'Not for me' },
];

const gameId = decodeURIComponent(location.pathname.split('/game/')[1] ?? '');

let user = null;
let game = null;
let myFeedback = null;
let myMatch = null;
let sort = null;
let draft = { verdict: null, body: '', hours: '' };

/* --------------------------------- header --------------------------------- */

function paintHead() {
  const actions = el('div', { class: 'gamehead__actions' }, SIGNALS.map(({ signal, label }) =>
    el('button', {
      class: myFeedback === signal ? 'act act--love' : 'act',
      type: 'button', 'aria-pressed': myFeedback === signal ? 'true' : 'false',
      text: label,
      onclick: (e) => setSignal(signal, e.currentTarget),
    })));

  render($('#gamehead'), el('div', { class: 'gamehead' }, [
    el('div', { class: 'gamehead__cover' }, [cover(game, { year: false })]),
    el('div', {}, [
      el('div', { class: 'gamehead__meta' }, [
        ...game.genres.map((g) => el('span', { class: 'chip chip--accent', text: g })),
        el('span', { class: 'chip', text: String(game.year) }),
        el('span', { class: 'chip', text: `${game.rating}/100 critics` }),
      ]),
      el('h1', { text: game.title }),
      el('p', { class: 'gamehead__blurb', text: game.blurb }),
      // Your match and the rate buttons come before the tag list: on a phone
      // ten tags pushed the only interactive controls below the fold.
      typeof myMatch === 'number'
        ? el('div', { class: 'gamehead__match' }, [
            matchRing(myMatch),
            el('div', { class: 'gamehead__match-text' }, [
              el('strong', { text: `${myMatch}% match with your taste` }),
              el('span', { text: myFeedback
                ? `You marked this "${SIGNALS.find((s) => s.signal === myFeedback)?.label.toLowerCase()}".`
                : 'Rate it below and your profile updates.' }),
            ]),
          ])
        : null,
      actions,
      user ? null : el('p', { class: 'legal', text: 'Sign in to rate this and see your taste match on every review.' }),
      el('div', { class: 'gamehead__tags gamehead__tags--after' }, game.tags.map((t) =>
        el('span', { class: 'chip', text: t.replace(/-/g, ' ') }))),
    ]),
  ]));
  document.title = `${game.title} — Playstyle`;
}

async function setSignal(signal, button) {
  if (!user) { location.href = '/auth'; return; }
  const previous = myFeedback;
  button.dataset.loading = 'true';
  try {
    if (previous === signal) { await api.clearFeedback(game.id); myFeedback = null; }
    else { await api.feedback(game.id, signal); myFeedback = signal; }
    paintHead();
    toast(myFeedback ? 'Saved to your profile' : 'Removed from your profile', { duration: 2600 });
  } catch (err) {
    delete button.dataset.loading;
    toast(err.message, { error: true });
  }
}

/* ----------------------------- verdict summary ---------------------------- */

function paintSplit(split) {
  // With no reviews this section would just repeat the empty state below it.
  if (!split.overall) { render($('#split'), []); return; }

  const cards = [
    el('div', { class: 'split__card' }, [
      el('p', { class: 'split__label', text: 'All reviewers' }),
      el('p', { class: 'split__value' }, [
        `${split.overall.recommend}%`,
        el('span', { class: 'split__unit', text: ' recommend' }),
      ]),
      el('p', { class: 'split__note', text: `${split.overall.count} review${split.overall.count === 1 ? '' : 's'}` }),
    ]),
  ];

  if (split.likeYou) {
    cards.unshift(el('div', { class: 'split__card split__card--hero' }, [
      el('p', { class: 'split__label', text: 'Players with your taste' }),
      el('p', { class: 'split__value' }, [
        `${split.likeYou.recommend}%`,
        el('span', { class: 'split__unit', text: ' recommend' }),
      ]),
      el('p', { class: 'split__note', text: `${split.likeYou.count} reviewers above ${split.matchFloor}% taste match` }),
    ]));
  } else {
    // Say plainly why the number is missing instead of hiding the card.
    cards.push(el('div', { class: 'split__card' }, [
      el('p', { class: 'split__label', text: 'Players with your taste' }),
      el('p', { class: 'split__note', text: !user
        ? 'Sign in and pick a few games you love to see this.'
        : `Only ${split.matchedCount} reviewer${split.matchedCount === 1 ? '' : 's'} here matches your taste closely. `
          + `We need ${split.minSample} before the number means anything.` }),
    ]));
  }
  render($('#split'), cards);
}

/* -------------------------------- reviews --------------------------------- */

function reviewCard(r) {
  const taste = r.author.taste;
  const tasteLine = taste.loves.length
    ? [el('span', { text: 'Loves ' }), el('strong', { text: taste.loves.join(', ') }),
       taste.tags.length ? el('span', { text: ` · ${taste.tags.join(', ')}` }) : null]
    : [el('span', { text: 'No taste profile yet' })];

  const vote = (helpful) => async (e) => {
    if (!user) { location.href = '/auth'; return; }
    const btn = e.currentTarget;
    btn.dataset.loading = 'true';
    const next = r.myVote === (helpful ? 'yes' : 'no') ? null : helpful;
    try {
      await api.voteReview(r.id, next);
      await loadReviews();
    } catch (err) {
      delete btn.dataset.loading;
      toast(err.message, { error: true });
    }
  };

  return el('article', { class: r.author.isMe ? 'review review--mine' : 'review' }, [
    el('div', { class: 'review__top' }, [
      el('div', { class: 'review__who' }, [
        el('p', { class: 'review__name', text: r.author.isMe ? `${r.author.username} (you)` : r.author.username }),
        el('p', { class: 'review__taste' }, tasteLine),
      ]),
      el('span', { class: `verdict verdict--${r.verdict}`, text: VERDICT_LABEL[r.verdict] }),
      // No point telling someone they are a 100% match with themselves.
      typeof r.tasteMatch === 'number' && !r.author.isMe
        ? el('div', { class: 'review__match' }, [
            matchRing(r.tasteMatch),
            el('div', { class: 'review__match-label', text: 'taste match' }),
          ])
        : null,
    ]),
    el('p', { class: 'review__body', text: r.body }),
    el('div', { class: 'review__foot' }, [
      r.hours !== null && r.hours !== undefined ? el('span', { text: `${r.hours} h played` }) : null,
      el('span', { text: new Date(r.updatedAt).toLocaleDateString() + (r.edited ? ' (edited)' : '') }),
      el('span', { class: 'review__foot-spacer' }),
      r.author.isMe
        ? el('button', { class: 'act', type: 'button', text: 'Edit', onclick: () => startEdit(r) })
        : el('button', { class: 'act', type: 'button', 'aria-pressed': String(r.myVote === 'yes'),
            text: `Helpful${r.helpfulYes ? ` (${r.helpfulYes})` : ''}`, onclick: vote(true) }),
      r.author.isMe
        ? el('button', { class: 'act act--meh', type: 'button', text: 'Delete', onclick: () => removeMine(r) })
        : el('button', { class: 'act', type: 'button', 'aria-pressed': String(r.myVote === 'no'),
            text: `Not helpful${r.helpfulNo ? ` (${r.helpfulNo})` : ''}`, onclick: vote(false) }),
      r.author.isMe ? null : el('button', { class: 'act', type: 'button', text: 'Report', onclick: () => report(r) }),
    ]),
  ]);
}

async function report(r) {
  const reason = 'abuse';
  try {
    const { hidden, threshold } = await api.reportReview(r.id, reason);
    toast(hidden
      ? 'Reported. This review is now hidden pending review.'
      : `Reported. ${threshold} reports hide a review pending moderation.`, { duration: 5000 });
    if (hidden) await loadReviews();
  } catch (err) { toast(err.message, { error: true }); }
}

/* --------------------------------- compose -------------------------------- */

function paintCompose(myReviewId) {
  if (!user) {
    render($('#compose'), el('div', { class: 'compose' }, [
      el('p', { text: 'Written a verdict on this one?' }),
      el('p', { class: 'split__note', text: 'Your review carries your taste profile, so players who like what you like will see how closely you match them.' }),
      el('p', { class: 'compose__foot' }, [
        el('a', { class: 'btn btn--primary', href: '/auth?mode=signup', text: 'Create a free account' }),
        el('a', { class: 'btn', href: '/auth', text: 'Sign in' }),
      ]),
    ]));
    return;
  }

  const bodyInput = el('textarea', {
    class: 'textarea', id: 'review-body', maxlength: String(BODY_MAX + 500),
    placeholder: 'What worked, what did not, and who you would recommend it to.',
    'aria-describedby': 'body-count body-error',
  });
  bodyInput.value = draft.body;

  const count = el('span', { class: 'compose__count', id: 'body-count' });
  const errorSlot = el('span', { class: 'field__error', id: 'body-error' });

  const updateCount = () => {
    const n = bodyInput.value.trim().length;
    count.textContent = n < BODY_MIN ? `${BODY_MIN - n} more characters` : `${n} / ${BODY_MAX}`;
    count.dataset.state = n > BODY_MAX ? 'over' : n >= BODY_MIN ? 'ok' : '';
  };
  bodyInput.addEventListener('input', () => {
    draft.body = bodyInput.value;
    updateCount();
    if (bodyInput.getAttribute('aria-invalid') === 'true') {
      bodyInput.setAttribute('aria-invalid', 'false');
      errorSlot.textContent = '';
    }
  });

  const hoursInput = el('input', {
    class: 'input compose__hours', id: 'review-hours', type: 'number', min: '0', max: '20000',
    step: '1', placeholder: 'Hours', 'aria-label': 'Hours played (optional)',
  });
  hoursInput.value = draft.hours;
  hoursInput.addEventListener('input', () => { draft.hours = hoursInput.value; });

  const verdictButtons = VERDICTS.map(({ key, label }) => {
    const btn = el('button', {
      class: 'compose__pick', type: 'button', text: label,
      'aria-pressed': draft.verdict === key ? 'true' : 'false',
    });
    btn.addEventListener('click', () => {
      draft.verdict = key;
      for (const b of btn.parentElement.children) b.setAttribute('aria-pressed', String(b === btn));
      errorSlot.textContent = '';
    });
    return btn;
  });

  const submit = el('button', {
    class: 'btn btn--primary', type: 'submit',
    text: myReviewId ? 'Update my review' : 'Post review',
  });

  const form = el('form', { class: 'compose', novalidate: true }, [
    el('h3', { class: 'gate__title', text: myReviewId ? 'Your review' : 'Write a review' }),
    el('p', { class: 'split__note', text: 'Your taste profile is shown alongside it, so readers can judge how much your verdict should count for them.' }),
    el('div', { class: 'compose__verdicts', role: 'group', 'aria-label': 'Your verdict' }, verdictButtons),
    bodyInput,
    errorSlot,
    el('div', { class: 'compose__foot' }, [hoursInput, el('span', { class: 'compose__spacer' }), count, submit]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = bodyInput.value.trim();
    if (!draft.verdict) { errorSlot.textContent = 'Pick a verdict first.'; return; }
    if (body.length < BODY_MIN) {
      errorSlot.textContent = `Write at least ${BODY_MIN} characters — ${BODY_MIN - body.length} to go.`;
      bodyInput.setAttribute('aria-invalid', 'true');
      bodyInput.focus();
      return;
    }
    if (body.length > BODY_MAX) {
      errorSlot.textContent = `That is ${body.length - BODY_MAX} characters over the limit.`;
      bodyInput.setAttribute('aria-invalid', 'true');
      return;
    }
    submit.dataset.loading = 'true';
    try {
      const res = await api.postReview(game.id, { verdict: draft.verdict, body, hours: draft.hours || null });
      draft = { verdict: null, body: '', hours: '' };
      toast(res.updated ? 'Review updated' : 'Review posted');
      await loadReviews();
    } catch (err) {
      delete submit.dataset.loading;
      if (err instanceof ApiError && err.fields) {
        errorSlot.textContent = err.fields.body || err.fields.verdict || err.fields.hours || err.message;
        if (err.fields.body) bodyInput.setAttribute('aria-invalid', 'true');
      } else {
        errorSlot.textContent = err.message;
      }
    }
  });

  render($('#compose'), form);
  updateCount();
}

function startEdit(r) {
  draft = { verdict: r.verdict, body: r.body, hours: r.hours ?? '' };
  paintCompose(r.id);
  $('#compose').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#review-body')?.focus();
}

async function removeMine(r) {
  try {
    await api.deleteReview(game.id);
    draft = { verdict: null, body: '', hours: '' };
    toast('Review deleted');
    await loadReviews();
  } catch (err) { toast(err.message, { error: true }); }
}

/* ---------------------------------- load ---------------------------------- */

async function loadReviews() {
  try {
    const data = await api.reviews(game.id, sort);
    sort = data.sort;
    paintSplit(data.split);

    // If they already have a review, the form is an edit form -- so load it
    // with what they wrote. An empty box under "Update my review" reads as if
    // the review had been lost.
    const existing = data.items.find((i) => i.author.isMe);
    if (existing && !draft.verdict && !draft.body) {
      draft = { verdict: existing.verdict, body: existing.body, hours: existing.hours ?? '' };
    }
    paintCompose(data.myReview);

    const bar = $('#sortbar');
    bar.hidden = data.items.length < 2;
    render($('#sort-options'), [
      user ? { key: 'match', label: 'Taste match' } : null,
      { key: 'helpful', label: 'Most helpful' },
      { key: 'new', label: 'Newest' },
    ].filter(Boolean).map(({ key, label }) => {
      const chip = el('button', {
        class: 'chip chip--button', type: 'button', text: label,
        'aria-pressed': sort === key ? 'true' : 'false',
      });
      chip.addEventListener('click', async () => { sort = key; await loadReviews(); });
      return chip;
    }));

    $('#reviews-sub').textContent = !user
      ? 'Sign in to see how closely each reviewer’s taste matches yours.'
      : sort === 'match'
        ? 'Ranked by how closely each reviewer’s taste matches yours.'
        : sort === 'helpful' ? 'Ranked by what other players found helpful.' : 'Newest first.';

    render($('#reviews'), data.items.length
      ? el('div', { class: 'reviews' }, data.items.map(reviewCard))
      : el('div', { class: 'card empty' }, [
          el('div', { class: 'empty__icon', 'aria-hidden': 'true', text: '✎' }),
          el('h3', { class: 'empty__title', text: 'No reviews yet' }),
          el('p', { class: 'empty__body', text: 'Nobody has written about this one. Yours would be the first.' }),
        ]));
  } catch (err) {
    render($('#reviews'), el('div', { class: 'card empty' }, [
      el('p', { class: 'empty__body', text: err.message }),
      el('button', { class: 'btn', type: 'button', text: 'Try again', onclick: loadReviews }),
    ]));
  }
}

async function boot() {
  render($('#gamehead'), el('div', { class: 'skeleton', style: { height: '220px' } }));
  render($('#reviews'), skeletonRecs(2));

  const [gameRes, meRes] = await Promise.allSettled([api.game(gameId), api.me()]);

  if (meRes.status === 'fulfilled') user = meRes.value.user;
  render($('#site-nav'), user
    ? navItems(user, { onSignOut: async () => { await api.logout(); location.reload(); } })
    : navItems(null));

  if (gameRes.status === 'rejected') {
    render($('#gamehead'), el('div', { class: 'card empty' }, [
      el('h1', { class: 'empty__title', text: 'Game not found' }),
      el('p', { class: 'empty__body', text: 'That link does not point at anything in the catalog.' }),
      el('a', { class: 'btn btn--primary', href: '/', text: 'Back to the catalog' }),
    ]));
    render($('#reviews'), []);
    render($('#split'), []);
    $('#reviews-sub').textContent = '';
    return;
  }

  game = gameRes.value.game;
  myFeedback = gameRes.value.myFeedback;
  myMatch = gameRes.value.myMatch;
  paintHead();
  await loadReviews();
}

boot();
