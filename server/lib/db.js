/**
 * Selects the data layer.
 *
 * Supabase over HTTPS is the default and what the deployment uses: it needs
 * only the publishable key, so there is nothing to configure on the host.
 *
 * DATABASE_URL is still honoured for a direct Postgres connection, which is
 * faster and supports transactions, for anyone running this on a host where
 * a connection string is easy to set.
 */
const impl = process.env.DATABASE_URL
  ? await import('./db-postgres.js')
  : await import('./db-supabase.js');

export const {
  migrate, withTransaction,
  Users, Sessions, Feedback, Hubs, Posts, Reviews,
  REPORT_THRESHOLD, BACKEND, DB_PATH,
} = impl;

export const IS_EPHEMERAL = false;

export const storageSummary = () => ({ backend: BACKEND, durable: true });
