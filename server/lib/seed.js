/** Creates the database file and schema. Safe to run repeatedly. */
import { migrate, DB_PATH } from './db.js';
import { stats } from './catalog.js';
migrate();
console.log(`Database ready at ${DB_PATH}`);
console.log(`Catalog: ${stats.games} games across ${stats.features} tag features.`);
