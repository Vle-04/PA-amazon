import { Router } from 'express';
import { getDb, now } from '../db.js';
import { requireUser } from '../auth.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { validate, required, int, idParam } from '../validate.js';

const r = Router();
r.use('/cart', requireUser);

export function loadCart(db, userId) {
  const rows = db.prepare(`SELECT ci.product_id, ci.quantity, ci.price_seen, p.title, p.price, p.stock, p.is_published,
      p.seller_id, u.store_name,
      (SELECT thumb_path FROM product_images WHERE product_id = p.id ORDER BY is_main DESC, position LIMIT 1) AS thumb
    FROM cart_items ci JOIN products p ON p.id = ci.product_id JOIN users u ON u.id = p.seller_id
    WHERE ci.user_id = ? ORDER BY u.store_name, ci.added_at`).all(userId);
  const groups = new Map();
  let total = 0;
  let count = 0;
  const warnings = [];
  for (const row of rows) {
    const soldOut = !row.is_published || row.stock === 0;
    const priceChanged = row.price !== row.price_seen;
    const tooMany = !soldOut && row.quantity > row.stock;
    const item = {
      productId: row.product_id, title: row.title, thumb: row.thumb, quantity: row.quantity,
      price: row.price, priceSeen: row.price_seen, stock: row.is_published ? row.stock : 0,
      priceChanged, soldOut, tooMany, lineTotal: soldOut ? 0 : row.price * row.quantity,
    };
    if (soldOut) warnings.push(`"${row.title}" is sold out. Remove it to continue.`);
    else if (priceChanged) warnings.push(`The price of "${row.title}" changed from ${row.price_seen} ֏ to ${row.price} ֏.`);
    if (tooMany) warnings.push(`Only ${row.stock} of "${row.title}" left. Lower the quantity.`);
    if (!groups.has(row.seller_id)) groups.set(row.seller_id, { sellerId: row.seller_id, storeName: row.store_name, items: [], subtotal: 0 });
    const g = groups.get(row.seller_id);
    g.items.push(item);
    g.subtotal += item.lineTotal;
    total += item.lineTotal;
    count += row.quantity;
  }
  const blocked = rows.some((x) => !x.is_published || x.stock === 0 || x.quantity > x.stock || x.price !== x.price_seen);
  return { groups: [...groups.values()], total, count, warnings, canCheckout: rows.length > 0 && !blocked };
}

r.get('/cart', (req, res) => res.json({ cart: loadCart(getDb(), req.user.id) }));

r.get('/cart/count', (req, res) => {
  const row = getDb().prepare('SELECT COALESCE(SUM(quantity), 0) AS n FROM cart_items WHERE user_id = ?').get(req.user.id);
  res.json({ count: row.n });
});

function loadBuyable(db, productId, userId) {
  const p = db.prepare('SELECT id, price, stock, is_published, seller_id FROM products WHERE id = ?').get(productId);
  if (!p || !p.is_published) throw notFound('Product not found');
  if (p.seller_id === userId) throw forbidden('You cannot buy your own product');
  return p;
}

r.post('/cart/items', (req, res) => {
  const b = validate(req.body, { productId: [required('Product'), int(1, Number.MAX_SAFE_INTEGER)], quantity: [required('Quantity'), int(1, 999)] });
  const db = getDb();
  db.transaction(() => {
    const p = loadBuyable(db, b.productId, req.user.id);
    const existing = db.prepare('SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.user.id, p.id);
    const qty = (existing?.quantity || 0) + b.quantity;
    if (qty > p.stock) {
      throw conflict('NOT_ENOUGH_STOCK', p.stock === 0 ? 'This item is sold out' : `Only ${p.stock} in stock${existing ? ` (you already have ${existing.quantity} in your cart)` : ''}`, { stock: p.stock });
    }
    db.prepare(`INSERT INTO cart_items (user_id, product_id, quantity, price_seen, added_at) VALUES (?,?,?,?,?)
      ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = excluded.quantity, price_seen = excluded.price_seen`)
      .run(req.user.id, p.id, qty, p.price, now());
  }).immediate();
  res.status(201).json({ cart: loadCart(db, req.user.id) });
});

r.patch('/cart/items/:productId', (req, res) => {
  const id = idParam(req.params.productId);
  const b = validate(req.body, { quantity: [required('Quantity'), int(1, 999)] });
  const db = getDb();
  if (!id || !db.prepare('SELECT 1 FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.user.id, id)) throw notFound('Item is not in your cart');
  const p = db.prepare('SELECT stock, is_published FROM products WHERE id = ?').get(id);
  if (!p.is_published || b.quantity > p.stock) {
    throw conflict('NOT_ENOUGH_STOCK', !p.is_published || p.stock === 0 ? 'This item is sold out' : `Only ${p.stock} in stock`, { stock: p.is_published ? p.stock : 0 });
  }
  db.prepare('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?').run(b.quantity, req.user.id, id);
  res.json({ cart: loadCart(db, req.user.id) });
});

r.delete('/cart/items/:productId', (req, res) => {
  const id = idParam(req.params.productId);
  const db = getDb();
  if (id) db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, id);
  res.json({ cart: loadCart(db, req.user.id) });
});

/** Buyer saw the price-change warning and accepts current prices. */
r.post('/cart/accept-prices', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE cart_items SET price_seen = (SELECT price FROM products WHERE id = cart_items.product_id) WHERE user_id = ?`).run(req.user.id);
  res.json({ cart: loadCart(db, req.user.id) });
});

export default r;
