import { now } from './db.js';
import { conflict, notFound } from './errors.js';

export const STATUSES = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];

// Section 5 of the PRD: from -> to -> actors allowed. Delivered and Cancelled are final.
const TRANSITIONS = {
  placed: { confirmed: ['seller'], cancelled: ['buyer', 'seller'] },
  confirmed: { shipped: ['seller'], cancelled: ['buyer', 'seller'] },
  shipped: { delivered: ['seller'] },
  delivered: {},
  cancelled: {},
};

export const allowedMoves = (status, role) =>
  Object.entries(TRANSITIONS[status] || {}).filter(([, roles]) => roles.includes(role)).map(([to]) => to);

/**
 * Moves one seller order. The caller must have already scoped `soId` to the actor
 * (buyer owns the order / seller owns the seller order). Runs in one immediate transaction.
 */
export function transition(db, soId, to, actor) {
  return db.transaction(() => {
    const so = db.prepare('SELECT id, status FROM seller_orders WHERE id = ?').get(soId);
    if (!so) throw notFound('Order not found');
    if (!allowedMoves(so.status, actor.role).includes(to)) {
      throw conflict('INVALID_TRANSITION', `Cannot change status from ${so.status} to ${to}`, { status: so.status });
    }
    const ts = now();
    const upd = db.prepare('UPDATE seller_orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run(to, ts, so.id, so.status);
    if (upd.changes !== 1) throw conflict('INVALID_TRANSITION', 'The order changed meanwhile, reload and try again');
    if (to === 'cancelled') {
      const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE seller_order_id = ?').all(so.id);
      const restock = db.prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?');
      for (const it of items) restock.run(it.quantity, ts, it.product_id);
    }
    db.prepare('INSERT INTO status_history (seller_order_id, from_status, to_status, actor_id, actor_role, created_at) VALUES (?,?,?,?,?,?)')
      .run(so.id, so.status, to, actor.id, actor.role, ts);
    return to;
  }).immediate();
}

export const historyOf = (db, soId) => db.prepare(
  'SELECT from_status AS "from", to_status AS "to", actor_role AS actor, created_at AS at FROM status_history WHERE seller_order_id = ? ORDER BY id'
).all(soId);
