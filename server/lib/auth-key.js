/**
 * The cookie signing key, kept in its own module so both the session code and
 * the Supabase verifier can use it without importing each other.
 *
 * Order of preference: SESSION_SECRET, then the key written at build time by
 * scripts/gen-session-key.mjs, then a development constant. A per-process
 * random key is never used -- it would log everyone out as soon as a second
 * server started.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const KEY_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.session-key');

let cached = null;
export function signingKey() {
  if (cached) return cached;
  if (process.env.SESSION_SECRET) return (cached = process.env.SESSION_SECRET);
  if (existsSync(KEY_FILE)) {
    const key = readFileSync(KEY_FILE, 'utf8').trim();
    if (key.length >= 32) return (cached = key);
  }
  if (process.env.NODE_ENV !== 'production') return (cached = 'dev-only-insecure-secret');
  throw new Error('No session signing key. Set SESSION_SECRET or run scripts/gen-session-key.mjs.');
}

export function keySource() {
  if (process.env.SESSION_SECRET) return 'env';
  if (existsSync(KEY_FILE)) return 'build-key';
  return 'dev-default';
}

/** Constant-time compare that tolerates differing lengths. */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
