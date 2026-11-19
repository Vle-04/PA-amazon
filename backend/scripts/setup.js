// Used by `npm run dev`: apply migrations, then seed once if the database is empty.
import { openDb, migrate } from '../src/db.js';

const db = openDb();
const applied = migrate(db);
if (applied.length) console.log('Applied migrations:', applied.join(', '));
const empty = db.prepare('SELECT COUNT(*) n FROM categories').get().n === 0;
db.close();
if (empty) await import('./seed.js');
