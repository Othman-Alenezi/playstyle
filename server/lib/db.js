/**
 * Picks the data-layer implementation and re-exports it.
 *
 * DATABASE_URL set  -> Postgres (Supabase in this project). Durable, shared
 *                      between every server, and what the deployment uses.
 * DATABASE_URL unset -> SQLite in a local file. The default for development,
 *                      so working on this needs no network and no credentials.
 *
 * Both expose the same async API, so nothing downstream branches on backend.
 */
const usePostgres = !!process.env.DATABASE_URL;

const impl = usePostgres
  ? await import('./db-postgres.js')
  : await import('./db-sqlite.js');

export const {
  migrate, withTransaction,
  Users, Sessions, Feedback, Hubs, Posts, Reviews,
  REPORT_THRESHOLD, BACKEND, DB_PATH,
} = impl;

/**
 * True when the store does not survive the process -- SQLite in a serverless
 * container's /tmp. Postgres is durable wherever it runs, so this is false
 * with DATABASE_URL set, which is what switches sessions back to real
 * revocable database rows and stops the app rebuilding accounts from cookies.
 */
export const IS_EPHEMERAL = usePostgres ? false : (impl.IS_EPHEMERAL ?? false);

export const storageSummary = () => ({
  backend: BACKEND,
  durable: !IS_EPHEMERAL,
});
