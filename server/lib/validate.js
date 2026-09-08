/**
 * Input validation. Returns a { field: message } map so the client can show
 * each error under the field that caused it rather than as one red block.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// Not a security control -- bcrypt is. This only stops the handful of
// passwords that show up in every credential-stuffing list.
const WORST = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'letmein1', 'iloveyou', 'welcome1', 'admin123', 'gamer123',
  'football', 'baseball', 'minecraft', 'dragon12', 'monkey12', 'abc12345',
]);

export function validateSignup({ email, username, password }) {
  const errors = {};
  email = String(email ?? '').trim().toLowerCase();
  username = String(username ?? '').trim();
  password = String(password ?? '');

  if (!email) errors.email = 'Enter your email address.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = "That doesn't look like a valid email.";

  if (!username) errors.username = 'Pick a username.';
  else if (!USERNAME_RE.test(username)) {
    errors.username = username.length < 3
      ? 'At least 3 characters.'
      : username.length > 20
        ? 'Keep it under 20 characters.'
        : 'Letters, numbers and underscores only.';
  }

  if (!password) errors.password = 'Choose a password.';
  else if (password.length < 8) errors.password = 'At least 8 characters.';
  else if (password.length > 128) errors.password = 'Under 128 characters, please.';
  else if (WORST.has(password.toLowerCase())) errors.password = 'That password is too common. Try something else.';

  return { errors, value: { email, username, password } };
}

export function validateLogin({ email, password }) {
  const errors = {};
  email = String(email ?? '').trim().toLowerCase();
  password = String(password ?? '');
  if (!email) errors.email = 'Enter your email address.';
  if (!password) errors.password = 'Enter your password.';
  return { errors, value: { email, password } };
}

/** Password strength score 0-4, mirrored on the client for the meter. */
export function strength(password = '') {
  let s = 0;
  if (password.length >= 8) s++;
  if (password.length >= 12) s++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s++;
  if (/\d/.test(password) && /[^\w\s]/.test(password)) s++;
  if (WORST.has(password.toLowerCase())) s = Math.min(s, 1);
  return s;
}
