/**
 * Vercel serverless entry point. Vercel imports the Express app and drives it
 * as a function handler; the app itself does not open a socket in this mode.
 */
import app from '../server/index.js';
export default app;
