import { Router } from 'express';
import { getDb, now } from '../db.js';
import { requireUser } from '../auth.js';
import { HttpError, conflict, forbidden, notFound } from '../errors.js';
import { validate, required, optional, str, phone, oneOf, idParam, REGIONS } from '../validate.js';
import { transition, allowedMoves, historyOf } from '../lifecycle.js';

const r = Router();
r.use('/orders', requireUser);

const addressRules = {
  recipient: [required('Recipient'), str(2, 100)],
  phone: [required('Phone'), str(6, 30), phone()],
  region: [required('Region'), oneOf(REGIONS)],
  city: [required('City'), str(2, 80)],
  street: [required('Street'), str(2, 120)],
  building: [required('Building'), str(1, 20)],
  apartment: [optional(''), str(0, 20)],
  note: [optional(''), str(0, 500)],
};

r.get('/orders/last-address', (req, res) => {
  const last = getDb().prepare(`SELECT recipient, phone, region, city, street, building, apartment FROM orders
    WHERE buyer_id = ? ORDER BY id DESC LIMIT 1`).get(req.user.id);
  res.json({ address: last || { recipient: req.user.name, phone: req.user.phone, region: 'Yerevan', city: 'Yerevan', street: '', building: '', apartment: '' } });
});

/**
 * FR-5 checkout. DR-5: one immediate transaction, conditional stock decrement per line,
 * any failure rolls back everything with 409. DR-6: same request key returns the same order.
 */
r.post('/orders', (req, res) => {
  const requestKey = typeof req.body?.requestKey === 'string' ? req.body.requestKey.trim() : '';
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestKey)) {
    throw new HttpError(400, 'VALIDATION', 'A request key (8–100 letters, digits, - or _) is required', { fields: { requestKey: 'Invalid request key' } });
  }
  const addr = validate(req.body, addressRules);
  const db = getDb();
  const buyerId = req.user.id;
  const findExisting = db.prepare('SELECT id FROM orders WHERE buyer_id = ? AND request_key = ?');

  const result = db.transaction(() => {
    const existing = findExisting.get(buyerId, requestKey);
    if (existing) return { id: existing.id, created: false };

    const lines = db.prepare(`SELECT ci.product_id, ci.quantity, ci.price_seen, p.title, p.price, p.stock, p.is_published, p.seller_id
      FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.user_id = ? ORDER BY p.seller_id, ci.added_at`).all(buyerId);
    if (!lines.length) throw new HttpError(400, 'EMPTY_CART', 'Your cart is empty');
    if (lines.some((l) => l.seller_id === buyerId)) throw forbidden('You cannot buy your own product');

    const changed = lines.filter((l) => l.is_published && l.price !== l.price_seen);
    if (changed.length) {
      throw conflict('PRICE_CHANGED', 'Some prices changed since you added the items. Please review your cart.', {
        items: changed.map((l) => ({ productId: l.product_id, title: l.title, oldPrice: l.price_seen, newPrice: l.price })),
      });
    }

    const ts = now();
    const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const orderId = db.prepare(`INSERT INTO orders (buyer_id, request_key, recipient, phone, region, city, street, building, apartment, note, total, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(buyerId, requestKey, addr.recipient, addr.phone, addr.region, addr.city, addr.street,
      addr.building, addr.apartment, addr.note, total, ts).lastInsertRowid;

    const decrement = db.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ? AND is_published = 1');
    const insSo = db.prepare("INSERT INTO seller_orders (order_id, seller_id, status, subtotal, created_at, updated_at) VALUES (?,?,'placed',?,?,?)");
    const insItem = db.prepare('INSERT INTO order_items (seller_order_id, product_id, title, unit_price, quantity) VALUES (?,?,?,?,?)');
    const insHist = db.prepare("INSERT INTO status_history (seller_order_id, from_status, to_status, actor_id, actor_role, created_at) VALUES (?, NULL, 'placed', ?, 'buyer', ?)");

    const bySeller = Map.groupBy(lines, (l) => l.seller_id);
    for (const [sellerId, items] of bySeller) {
      const subtotal = items.reduce((s, l) => s + l.price * l.quantity, 0);
      const soId = insSo.run(orderId, sellerId, subtotal, ts, ts).lastInsertRowid;
      for (const l of items) {
        if (decrement.run(l.quantity, ts, l.product_id, l.quantity).changes !== 1) {
          throw conflict('OUT_OF_STOCK', l.stock === 0 || !l.is_published ? `"${l.title}" is sold out` : `Only ${l.stock} of "${l.title}" left`, {
            items: [{ productId: l.product_id, title: l.title, stock: l.is_published ? l.stock : 0 }],
          });
        }
        insItem.run(soId, l.product_id, l.title, l.price, l.quantity);
      }
      insHist.run(soId, buyerId, ts);
    }
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(buyerId);
    return { id: orderId, created: true };
  }).immediate();

  res.status(result.created ? 201 : 200).json({ order: loadOrder(db, result.id, buyerId), duplicate: !result.created });
});

export function loadOrder(db, orderId, buyerId) {
  // DR-8: always scoped to the buyer.
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?').get(orderId, buyerId);
  if (!o) return null;
  const parts = db.prepare(`SELECT so.id, so.status, so.subtotal, so.seller_id, u.store_name, u.store_phone FROM seller_orders so
    JOIN users u ON u.id = so.seller_id WHERE so.order_id = ? ORDER BY so.id`).all(o.id);
  const itemsStmt = db.prepare(`SELECT oi.product_id AS productId, oi.title, oi.unit_price AS unitPrice, oi.quantity,
      (SELECT thumb_path FROM product_images WHERE product_id = oi.product_id ORDER BY is_main DESC, position LIMIT 1) AS thumb,
      EXISTS (SELECT 1 FROM reviews r WHERE r.product_id = oi.product_id AND r.buyer_id = ?) AS reviewed
    FROM order_items oi WHERE oi.seller_order_id = ? ORDER BY oi.id`);
  return {
    id: o.id, number: orderNumber(o.id), createdAt: o.created_at, total: o.total,
    address: { recipient: o.recipient, phone: o.phone, region: o.region, city: o.city, street: o.street, building: o.building, apartment: o.apartment, note: o.note },
    parts: parts.map((p) => ({
      id: p.id, status: p.status, subtotal: p.subtotal, storeName: p.store_name, storePhone: p.store_phone,
      canCancel: allowedMoves(p.status, 'buyer').includes('cancelled'),
      items: itemsStmt.all(buyerId, p.id).map((i) => ({ ...i, reviewed: !!i.reviewed, canReview: p.status === 'delivered' && !i.reviewed })),
      history: historyOf(db, p.id),
    })),
  };
}

export const orderNumber = (id) => `SH-${String(id).padStart(6, '0')}`;

r.get('/orders', (req, res) => {
  const db = getDb();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const rows = db.prepare('SELECT id, created_at, total FROM orders WHERE buyer_id = ? ORDER BY id DESC LIMIT 20 OFFSET ?').all(req.user.id, (page - 1) * 20);
  const total = db.prepare('SELECT COUNT(*) n FROM orders WHERE buyer_id = ?').get(req.user.id).n;
  const partsStmt = db.prepare('SELECT so.id, so.status, so.subtotal, u.store_name AS storeName FROM seller_orders so JOIN users u ON u.id = so.seller_id WHERE so.order_id = ? ORDER BY so.id');
  res.json({
    items: rows.map((o) => ({ id: o.id, number: orderNumber(o.id), createdAt: o.created_at, total: o.total, parts: partsStmt.all(o.id) })),
    total, page, pages: Math.max(1, Math.ceil(total / 20)),
  });
});

r.get('/orders/:id', (req, res) => {
  const id = idParam(req.params.id);
  const order = id && loadOrder(getDb(), id, req.user.id);
  if (!order) throw notFound('Order not found');
  res.json({ order });
});

/** FR-6: buyer cancels one seller's part while it is Placed or Confirmed. */
r.post('/orders/:id/parts/:partId/cancel', (req, res) => {
  const id = idParam(req.params.id);
  const partId = idParam(req.params.partId);
  const db = getDb();
  const owned = id && partId && db.prepare(`SELECT so.id FROM seller_orders so JOIN orders o ON o.id = so.order_id
    WHERE so.id = ? AND o.id = ? AND o.buyer_id = ?`).get(partId, id, req.user.id);
  if (!owned) throw notFound('Order not found');
  transition(db, partId, 'cancelled', { id: req.user.id, role: 'buyer' });
  res.json({ order: loadOrder(db, id, req.user.id) });
});

export default r;
