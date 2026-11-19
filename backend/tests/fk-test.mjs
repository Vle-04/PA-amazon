// Break-it test 8: an order item for a nonexistent product is rejected by SQLite itself.
// Run against the real database: `npm run test:fk` (on the server: `fly ssh console -C "node /app/backend/tests/fk-test.mjs"`).
import { openDb, migrate } from '../src/db.js';

const db = openDb();
migrate(db);
const fk = db.pragma('foreign_keys', { simple: true });
const strict = db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='table' AND sql LIKE '%) STRICT'").get().n;
let ok = false;
try {
  db.transaction(() => {
    db.prepare('INSERT INTO order_items (seller_order_id, product_id, title, unit_price, quantity) VALUES (?,?,?,?,?)')
      .run(999999999, 999999999, 'ghost', 100, 1);
  })();
  console.log('FAIL: insert was accepted');
} catch (e) {
  ok = e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY';
  console.log(ok ? `PASS: rejected by SQLite (${e.code}: ${e.message})` : `FAIL: unexpected error ${e.code}`);
}
console.log(`foreign_keys=${fk}, STRICT tables=${strict}`);
db.close();
process.exit(ok && fk === 1 && strict === 10 ? 0 : 1);
