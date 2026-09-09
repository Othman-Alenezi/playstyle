/**
 * Supabase Auth from the browser, over its REST API.
 *
 * Deliberately no supabase-js: the library would have to come from a CDN,
 * which means loosening script-src in the CSP. Two fetch calls do the same
 * job and keep `script-src 'self'`.
 *
 * The access token is handed straight to our own server and never written to
 * localStorage -- anything stored there is readable by any injected script.
 * The refresh token is discarded; our own session cookie is what keeps you
 * signed in.
 */
let config = null;

export async function loadConfig() {
  if (config !== null) return config;
  try {
    const res = await fetch('/api/config', { credentials: 'same-origin' });
    config = (await res.json()).supabase ?? false;
  } catch {
    config = false;
  }
  return config;
}

export const isEnabled = () => !!config;

async function call(path, body) {
  const res = await fetch(`${config.url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.publishableKey },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

/** Turn Supabase's error vocabulary into something a person can act on. */
function readableError(status, data) {
  const code = data?.error_code || data?.error || '';
  const msg = data?.msg || data?.error_description || data?.message || '';
  const map = {
    email_address_invalid: 'Supabase rejected that email address. Try a different one.',
    user_already_exists: 'That email already has an account. Sign in instead.',
    email_exists: 'That email already has an account. Sign in instead.',
    weak_password: 'That password is too weak. Use at least 8 characters.',
    invalid_credentials: 'Email or password is incorrect.',
    email_not_confirmed: 'Check your email and confirm the address, then sign in.',
    over_email_send_rate_limit: 'Too many sign-up emails just now. Wait a few minutes.',
    validation_failed: msg || 'Check the details and try again.',
  };
  if (map[code]) return map[code];
  if (status === 400 && /password/i.test(msg)) return 'That password is too short. Use at least 8 characters.';
  if (status === 429) return 'Too many attempts. Wait a moment and try again.';
  return msg || 'Sign-in failed. Try again.';
}

/**
 * Hand a verified Supabase token to our server, which issues the session
 * cookie the rest of the app uses.
 */
async function exchange(accessToken, seed) {
  const res = await fetch('/api/auth/supabase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ access_token: accessToken, seed }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Could not start your session.');
  return data;
}

export async function signUp({ email, password, username, seed }) {
  const { ok, status, data } = await call('signup', {
    email, password, data: { username },
  });
  if (!ok) throw new Error(readableError(status, data));

  // With email confirmation switched on, Supabase creates the user but
  // returns no session. That is a legitimate state, not an error.
  if (!data.access_token) {
    return { needsEmailConfirmation: true, email };
  }
  return exchange(data.access_token, seed);
}

export async function signIn({ email, password, seed }) {
  const { ok, status, data } = await call('token?grant_type=password', { email, password });
  if (!ok) throw new Error(readableError(status, data));
  if (!data.access_token) throw new Error('Supabase did not return a session.');
  return exchange(data.access_token, seed);
}
