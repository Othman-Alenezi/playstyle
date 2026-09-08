/** Review input rules. Mirrored on the client in public/js/game.js. */
export const VERDICTS = ['recommend', 'mixed', 'avoid'];
export const BODY_MIN = 40;
export const BODY_MAX = 4000;
export const HOURS_MAX = 20000;

export const REPORT_REASONS = ['spam', 'abuse', 'off-topic', 'spoilers'];

export function validateReview({ verdict, body, hours }) {
  const errors = {};
  verdict = String(verdict ?? '');
  // Collapse runs of whitespace so 200 blank lines cannot pass the minimum.
  body = String(body ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  if (!VERDICTS.includes(verdict)) errors.verdict = 'Pick a verdict.';

  if (!body) errors.body = 'Write a few words about it.';
  else if (body.length < BODY_MIN) errors.body = `${BODY_MIN - body.length} more characters needed.`;
  else if (body.length > BODY_MAX) errors.body = `${body.length - BODY_MAX} characters over the limit.`;

  let parsedHours = null;
  if (hours !== null && hours !== undefined && hours !== '') {
    const n = Number(hours);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) errors.hours = 'Whole numbers only.';
    else if (n > HOURS_MAX) errors.hours = 'That is more hours than exist. Try again.';
    else parsedHours = n;
  }

  return { errors, value: { verdict, body, hours: parsedHours } };
}
