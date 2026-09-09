/** Creates the database file and schema. Safe to run repeatedly. */
import { migrate, DB_PATH, BACKEND } from './db.js';
import { stats } from './catalog.js';
await migrate();
console.log(`Database ready (${BACKEND}) at ${DB_PATH}`);
console.log(`Catalog: ${stats.games} games across ${stats.features} tag features.`);
