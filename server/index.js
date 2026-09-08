import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import { migrate, Sessions, db, IS_EPHEMERAL } from './lib/db.js';
import { attachUser, verifyOrigin } from './middleware.js';
import { sessionInfo } from './lib/auth.js';
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/games.js';
import tasteRoutes from './routes/taste.js';
import reviewRoutes from './routes/reviews.js';
import hubRoutes from './routes/hubs.js';
import { stats, byId } from './lib/catalog.js';
import { hubs } from './lib/hubs.js';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === 'production';
const ORIGINS = (process.env.ALLOWED_ORIGINS || `http://localhost:${PORT}`)
  .split(',').map((s) => s.trim()).filter(Boolean);

const catalogHas = (id) => byId.has(id);

migrate();

/**
 * On an ephemeral filesystem the database is empty on every cold start, so
 * populate it with the demo content rather than showing an empty site. Local
 * runs are untouched: there the database persists and is seeded explicitly
 * with `npm run db:demo`.
 */
if (IS_EPHEMERAL) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n === 0) {
    const { seedDemoData } = await import('./lib/demo.js');
    await seedDemoData({ quiet: true });
    console.log('[boot] ephemeral filesystem detected: demo data seeded');
  }
}

const app = express();
app.set('trust proxy', PROD ? 1 : false); // req.ip must be real for rate limiting
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],                   // no inline scripts anywhere in this app
      styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      // Cover art falls back to a CDN when it is not on disk: Steam for most
      // titles, Wikimedia for the console exclusives Steam does not carry.
      imgSrc: [
        "'self'", 'data:',
        'https://cdn.cloudflare.steamstatic.com',
        'https://upload.wikimedia.org',
        'https://thumb.wikimedia.org',
      ],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: PROD ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(verifyOrigin(ORIGINS));
app.use(attachUser);

app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api', tasteRoutes);
app.use('/api', reviewRoutes);
app.use('/api', hubRoutes);

app.get('/api/health', (_req, res) => res.json({
  ok: true, catalog: stats, uptime: process.uptime(),
  // Which session strategy is active, and where its signing key came from.
  // If keySource is ever "dev-default" on a deployment, sessions are broken.
  session: sessionInfo(),
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// Pretty URLs for game pages; the client reads the id from the path.
// An unknown id still returns the page shell -- the client renders a proper
// not-found state -- but with a 404 status, so crawlers and monitoring see
// the truth rather than a soft 200.
app.get('/game/:id', (req, res) => {
  res.status(catalogHas(req.params.id) ? 200 : 404).sendFile(join(PUBLIC, 'game.html'));
});

app.get('/fandom/:slug', (req, res) => {
  res.status(hubs.has(req.params.slug) ? 200 : 404).sendFile(join(PUBLIC, 'hub.html'));
});

app.use(express.static(PUBLIC, {
  extensions: ['html'],
  maxAge: PROD ? '1h' : 0,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Unknown non-API path: hand back the landing page -- but only for page
// requests. A missing asset must 404, not return HTML with a 200, or a broken
// image looks like a successful response to everything inspecting it.
app.use((req, res) => {
  if (/\.[a-z0-9]{2,5}$/i.test(req.path)) {
    return res.status(404).type('txt').send('Not found');
  }
  res.sendFile(join(PUBLIC, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'server_error', message: 'Something broke on our end.' });
});

// Housekeeping: drop expired sessions hourly.
setInterval(() => {
  const n = Sessions.purgeExpired();
  if (n) console.log(`[sessions] purged ${n} expired`);
}, 60 * 60e3).unref();

export default app;

/**
 * Only listen when this file is the process entry point. Under a serverless
 * host the platform imports `app` and handles the socket itself.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = app.listen(PORT, () => {
    console.log(`Playstyle running on http://localhost:${PORT}  (${stats.games} games, ${stats.features} tags)`);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { server.close(() => process.exit(0)); });
  }
}
