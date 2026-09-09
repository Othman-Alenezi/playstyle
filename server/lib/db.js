/**
 * Selects the data layer.
 *
 * Supabase over HTTPS is the default, and choosing Postgres requires an
 * explicit USE_POSTGRES=1 rather than merely the presence of DATABASE_URL.
 *
 * That distinction is deliberate. A DATABASE_URL left behind from an earlier
 * attempt took the entire deployment down -- the app selected a connection it
 * could not open and died on every request. Opting in explicitly means a
 * stale variable is inert, and the default path needs no configuration at
 * all: the publishable key is designed to be public, so there is nothing to
 * set on the host.
 */
const usePostgres = process.env.USE_POSTGRES === '1' && !!process.env.DATABASE_URL;

const impl = usePostgres
  ? await import('./db-postgres.js')
  : await import('./db-supabase.js');

export const {
  migrate, withTransaction,
  Users, Sessions, Feedback, Hubs, Posts, Reviews,
  REPORT_THRESHOLD, BACKEND, DB_PATH,
} = impl;

export const IS_EPHEMERAL = false;

export const storageSummary = () => ({ backend: BACKEND, durable: true });
