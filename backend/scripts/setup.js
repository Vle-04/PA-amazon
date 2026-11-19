// Runs before the server starts (`npm run dev` and `npm start`):
// apply migrations, then load the demo data if the database is empty.
// Hosts without a shell (e.g. Render free plan) get demo data automatically this way.
// Set AUTO_SEED=off to start with an empty marketplace instead.
import { openDb, migrate } from '../src/db.js';

const db = openDb();
const applied = migrate(db);
if (applied.length) console.log('Applied migrations:', applied.join(', '));
const empty = db.prepare('SELECT COUNT(*) n FROM categories').get().n === 0;
db.close();
const autoSeed = String(process.env.AUTO_SEED || 'on').toLowerCase() !== 'off';
if (empty && autoSeed) {
  console.log('Database is empty: loading demo data…');
  await import('./seed.js');
}
