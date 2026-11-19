import fs from 'node:fs';
import path from 'node:path';
import { BACKUPS_DIR } from './config.js';

const KEEP = 7;

/** NFR-5: consistent copy with VACUUM INTO; keeps the last 7 daily files. */
export function backupNow(db) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const file = path.join(BACKUPS_DIR, `shuka-${stamp}.db`);
  if (fs.existsSync(file)) fs.rmSync(file);
  db.prepare('VACUUM INTO ?').run(file);
  const old = fs.readdirSync(BACKUPS_DIR).filter((f) => /^shuka-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(KEEP);
  for (const f of old) fs.rmSync(path.join(BACKUPS_DIR, f));
  return file;
}

/** Runs a backup at start-up if today's is missing, then checks hourly. */
export function scheduleDailyBackup(db) {
  const tick = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (!fs.existsSync(path.join(BACKUPS_DIR, `shuka-${stamp}.db`))) {
      try { console.log('Backup written:', backupNow(db)); } catch (e) { console.error('Backup failed', e); }
    }
  };
  setTimeout(tick, 10_000).unref();
  setInterval(tick, 3600_000).unref();
}
