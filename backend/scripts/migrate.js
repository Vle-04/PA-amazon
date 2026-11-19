import { openDb, migrate } from '../src/db.js';
import { DB_PATH } from '../src/config.js';

const db = openDb();
const applied = migrate(db);
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date', `(${DB_PATH})`);
db.close();
