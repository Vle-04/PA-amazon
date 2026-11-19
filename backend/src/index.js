import { createApp } from './app.js';
import { getDb } from './db.js';
import { PORT, DB_PATH, SESSION_SECRET, EMAIL_VERIFICATION } from './config.js';

if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  console.error('SESSION_SECRET (16+ characters) must be set in production. Example: fly secrets set SESSION_SECRET=$(openssl rand -hex 32)');
  process.exit(1);
}
import { scheduleDailyBackup } from './backup.js';
import { mailConfigured } from './mail.js';

const db = getDb();
if (EMAIL_VERIFICATION && !mailConfigured) console.warn('SMTP_HOST is not set: verification emails will be printed to this console instead of sent.');
scheduleDailyBackup(db);
const server = createApp().listen(PORT, () => console.log(`Shuka listening on http://localhost:${PORT} (db: ${DB_PATH})`));

const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
