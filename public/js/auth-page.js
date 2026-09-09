/**
 * Login / signup. One form, two modes, no page reload between them.
 * Validation runs on blur (never while someone is mid-word) and clears the
 * moment they start fixing it.
 */
import { api, ApiError } from './api.js';
import * as supa from './supabase-auth.js';
import { picks } from './store.js';
import { $, $$, el, render, themeToggle, toast } from './ui.js';

const form = $('#auth-form');
const submit = $('#submit');
const formError = $('#form-error');
const fields = {
  email: $('#email'),
  username: $('#username'),
  password: $('#password'),
};

let mode = new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'login';

/* --------------------------- client-side validation ----------------------- */
/* Mirrors server/lib/validate.js. The server is the authority; this exists so
   people get an answer without a round trip. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const rules = {
  email: (v) => !v.trim() ? 'Enter your email address.'
    : !EMAIL_RE.test(v.trim()) ? "That doesn't look like a valid email." : '',
  username: (v) => mode !== 'signup' ? ''
    : !v.trim() ? 'Pick a username.'
    : v.trim().length < 3 ? 'At least 3 characters.'
    : !USERNAME_RE.test(v.trim()) ? 'Letters, numbers and underscores only.' : '',
  password: (v) => !v ? 'Enter your password.'
    : mode === 'signup' && v.length < 8 ? 'At least 8 characters.' : '',
};

function setError(name, message) {
  const input = fields[name];
  const slot = $(`#${name}-error`);
  slot.textContent = message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  return !message;
}

function validateField(name) {
  return setError(name, rules[name](fields[name].value));
}

function validateAll() {
  // Validate every field, then focus the first broken one.
  const names = mode === 'signup' ? ['email', 'username', 'password'] : ['email', 'password'];
  const bad = names.filter((n) => !validateField(n));
  if (bad.length) fields[bad[0]].focus();
  return bad.length === 0;
}

/* ------------------------------ password meter ---------------------------- */

const WORST = new Set(['password', 'password1', 'password123', '12345678', '123456789',
  'qwerty123', 'letmein1', 'iloveyou', 'welcome1', 'admin123', 'gamer123', 'minecraft']);

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^\w\s]/.test(pw)) s++;
  if (WORST.has(pw.toLowerCase())) s = Math.min(s, 1);
  return s;
}

const STRENGTH_TEXT = ['', 'Weak — add length or variety', 'Getting there', 'Strong', 'Very strong'];

function paintMeter() {
  if (mode !== 'signup') return;
  const pw = fields.password.value;
  const score = pw ? strength(pw) : 0;
  $$('.meter__seg').forEach((seg, i) => {
    if (i < score) seg.dataset.on = String(score); else delete seg.dataset.on;
  });
  $('#meter-text').textContent = pw ? STRENGTH_TEXT[score] : '';
}

/* --------------------------------- modes ---------------------------------- */

const COPY = {
  login: {
    title: 'Welcome back',
    lead: 'Sign in to pick up where your profile left off.',
    submit: 'Sign in',
    switchText: 'New here? ',
    switchAction: 'Create a free account',
    autocomplete: 'current-password',
  },
  signup: {
    title: 'Create your account',
    lead: 'Free, and your taste profile starts working immediately.',
    submit: 'Create account',
    switchText: 'Already have an account? ',
    switchAction: 'Sign in instead',
    autocomplete: 'new-password',
  },
};

function applyMode(next, { focus = false } = {}) {
  mode = next;
  const copy = COPY[mode];
  const isSignup = mode === 'signup';

  $('#tab-login').setAttribute('aria-selected', String(!isSignup));
  $('#tab-signup').setAttribute('aria-selected', String(isSignup));
  $('#auth-title').textContent = copy.title;
  $('#auth-lead').textContent = copy.lead;
  submit.textContent = copy.submit;
  document.title = `${copy.submit} — Playstyle`;

  $('#username-field').hidden = !isSignup;
  fields.username.required = isSignup;
  $('#meter').hidden = !isSignup;
  $('#meter-text').hidden = !isSignup;
  $('#password-hint').hidden = !isSignup;
  fields.password.setAttribute('autocomplete', copy.autocomplete);

  render($('#switch-line'), copy.switchText, el('button', {
    type: 'button', text: copy.switchAction,
    onclick: () => applyMode(isSignup ? 'login' : 'signup', { focus: true }),
  }));

  // Clear stale errors so switching modes never shows the other form's complaints.
  formError.dataset.show = 'false';
  for (const name of Object.keys(fields)) setError(name, '');
  paintMeter();

  const url = new URL(location.href);
  if (isSignup) url.searchParams.set('mode', 'signup'); else url.searchParams.delete('mode');
  history.replaceState(null, '', url);

  if (focus) (fields.email.value ? fields.password : fields.email).focus();
}

/* -------------------------------- submit ---------------------------------- */

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.dataset.show = 'false';
  if (!validateAll()) return;

  submit.dataset.loading = 'true';
  const payload = {
    email: fields.email.value.trim(),
    password: fields.password.value,
    // Guest quiz picks ride along so the account is useful the second it exists.
    seed: picks.get(),
  };
  if (mode === 'signup') payload.username = fields.username.value.trim();

  try {
    // Supabase holds the credentials when it is configured; the local
    // endpoints stay as a fallback so this page still works offline.
    const result = supa.isEnabled()
      ? (mode === 'signup'
          ? await supa.signUp({ ...payload, username: payload.username })
          : await supa.signIn(payload))
      : (mode === 'signup' ? await api.signup(payload) : await api.login(payload));

    if (result?.needsEmailConfirmation) {
      delete submit.dataset.loading;
      render(formError,
        `Almost there — confirm ${result.email} from the email Supabase just sent, then sign in.`);
      formError.dataset.show = 'true';
      formError.classList.add('form__error--info');
      applyMode('login');
      fields.email.value = payload.email;
      return;
    }

    picks.clear();
    location.href = result.user.onboarded ? '/app' : '/';
  } catch (err) {
    delete submit.dataset.loading;
    if (err instanceof ApiError && err.fields) {
      // Field-level errors go under their field, not into one red block.
      let first = null;
      for (const [name, message] of Object.entries(err.fields)) {
        if (fields[name]) { setError(name, message); first ??= fields[name]; }
      }
      first?.focus();
      if (err.code === 'email_taken' && mode === 'signup') {
        render(formError, 'That email already has an account. ', el('button', {
          class: 'toast__action', type: 'button', text: 'Sign in instead',
          onclick: () => { applyMode('login'); fields.password.focus(); },
        }));
        formError.dataset.show = 'true';
      }
      return;
    }
    formError.classList.remove('form__error--info');
    formError.textContent = err.message;
    formError.dataset.show = 'true';
  }
});

/* ------------------------------- listeners -------------------------------- */

$('#tab-login').addEventListener('click', () => applyMode('login', { focus: true }));
$('#tab-signup').addEventListener('click', () => applyMode('signup', { focus: true }));

for (const [name, input] of Object.entries(fields)) {
  input.addEventListener('blur', () => { if (input.value || input.required) validateField(name); });
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') setError(name, '');
    formError.dataset.show = 'false';
  });
}

fields.password.addEventListener('input', paintMeter);

// Caps Lock is the single most common cause of "my password is wrong".
const capsWatch = (e) => {
  const on = typeof e.getModifierState === 'function' && e.getModifierState('CapsLock');
  $('#caps-warning').textContent = on ? 'Caps Lock is on.' : '';
};
fields.password.addEventListener('keydown', capsWatch);
fields.password.addEventListener('keyup', capsWatch);
fields.password.addEventListener('blur', () => { $('#caps-warning').textContent = ''; });

$('#reveal').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const shown = fields.password.type === 'text';
  fields.password.type = shown ? 'password' : 'text';
  btn.textContent = shown ? 'Show' : 'Hide';
  btn.setAttribute('aria-pressed', String(!shown));
  btn.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
  fields.password.focus();
});

/* --------------------------------- boot ----------------------------------- */

render($('#site-nav'), themeToggle());

// Find out whether Supabase is handling credentials before the form is usable.
await supa.loadConfig();
if (supa.isEnabled()) {
  const note = $('#auth-lead');
  note.dataset.supabase = 'true';
}

const carriedCount = picks.count();
if (carriedCount) {
  const box = $('#carried');
  box.hidden = false;
  render(box, el('span', { text: '✓' }), el('span', {
    text: `${carriedCount} ${carriedCount === 1 ? 'pick' : 'picks'} from your quiz will be saved to this account.`,
  }));
}

applyMode(mode);
fields.email.focus();

// Already signed in? Don't make them look at a login form.
api.me().then(({ user }) => {
  if (!user) return;
  toast(`Already signed in as ${user.username}.`, { duration: 3000 });
  setTimeout(() => { location.href = '/app'; }, 700);
}).catch(() => { /* offline: the form still works */ });
