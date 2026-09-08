/**
 * Generates a per-deployment session signing key at build time.
 *
 * Serverless containers each start their own process, so a key generated at
 * runtime differs between them and every session breaks the moment a request
 * lands on a different container. Generating it once during the build gives
 * every container of a deployment the same key, without asking anyone to
 * configure an environment variable.
 *
 * SESSION_SECRET still wins when set, and is what a real deployment should
 * use: this file changes on every build, so sessions end at each redeploy.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const path = new URL('../.session-key', import.meta.url);
if (existsSync(path) && !process.env.FORCE_NEW_SESSION_KEY) {
  console.log('[session-key] already present, keeping it');
} else {
  writeFileSync(path, randomBytes(32).toString('hex'), { mode: 0o600 });
  console.log('[session-key] generated');
}
