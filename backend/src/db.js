import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DATA_DIR, DB_PATH, UPLOADS_DIR, BACKUPS_DIR, ROOT } from './config.js';

export function openDb(file = DB_PATH) {
  for (const d of [DATA_DIR, UPLOADS_DIR, BACKUPS_DIR]) fs.mkdirSync(d, { recursive: true });
  const db = new Database(file);
  // DR-4 / NFR-1: set on every connection.
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  return db;
}

/** Applies numbered migrations from src/migrations, tracked with PRAGMA user_version. */
export function migrate(db) {
  const dir = path.join(ROOT, 'src', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  let current = db.pragma('user_version', { simple: true });
  const applied = [];
  for (const f of files) {
    const n = parseInt(f, 10);
    if (n <= current) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${n}`);
    }).immediate();
    current = n;
    applied.push(f);
  }
  return applied;
}

export const now = () => new Date().toISOString();

let instance;
export function getDb() {
  if (!instance) {
    instance = openDb();
    migrate(instance);
  }
  return instance;
}
