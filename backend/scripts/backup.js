import { openDb } from '../src/db.js';
import { backupNow } from '../src/backup.js';

const db = openDb();
console.log('Backup written:', backupNow(db));
db.close();
