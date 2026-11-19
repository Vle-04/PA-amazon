import { Router } from 'express';
import multer from 'multer';
import { getDb, now } from '../db.js';
import { requireSeller } from '../auth.js';
import { HttpError, badRequest, notFound } from '../errors.js';
import { validate, required, str, int, bool, oneOf, idParam } from '../validate.js';
import { processImage, uploadExists, imagePaths } from '../images.js';
import { MAX_UPLOAD_BYTES } from '../config.js';
import { STATUSES, transition, allowedMoves, historyOf } from '../lifecycle.js';
import { orderNumber } from './orders.js';

const r = Router();
r.use('/seller', requireSeller);
r.use('/uploads', requireSeller);

// ---------- Images (processed before any DB transaction, NFR-1) ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

r.post('/uploads', upload.single('image'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'NO_FILE', 'Choose an image to upload (form field "image")');
  const img = await processImage(req.file.buffer);
  res.status(201).json({ image: img });
});

// ---------- Products (FR-8) ----------
const productRules = (db) => ({
  title: [required('Title'), str(3, 120)],
  description: [required('Description'), str(10, 5000)],
  price: [required('Price'), int(1, 100_000_000)],
  stock: [required('Stock'), int(0, 1_000_000)],
  categoryId: [required('Category'), int(1, Number.MAX_SAFE_INTEGER), (v) => (db.prepare('SELECT 1 FROM categories WHERE id = ?').get(v) ? null : 'Choose a category')],
  isPublished: [bool()],
});

async function validateImages(images) {
  if (!Array.isArray(images) || images.length < 1) throw badRequest('Please fix the highlighted fields', { images: 'Add at least one photo' });
  if (images.length > 5) throw badRequest('Please fix the highlighted fields', { images: 'At most 5 photos' });
  if (new Set(images).size !== images.length) throw badRequest('Please fix the highlighted fields', { images: 'Duplicate photo' });
  for (const k of images) {
    if (typeof k !== 'string' || !(await uploadExists(k))) throw badRequest('Please fix the highlighted fields', { images: 'A photo is missing, upload it again' });
  }
  return images;
}

function saveImages(db, productId, keys) {
  db.prepare('DELETE FROM product_images WHERE product_id = ?').run(productId);
  const ins = db.prepare('INSERT INTO product_images (product_id, thumb_path, large_path, position, is_main) VALUES (?,?,?,?,?)');
  keys.forEach((k, i) => {
    const p = imagePaths(k);
    ins.run(productId, p.thumb, p.large, i, i === 0 ? 1 : 0);
  });
}

const keyFromPath = (p) => p.match(/\/uploads\/([a-f0-9]{32})_/)?.[1];

r.get('/seller/products', (req, res) => {
  const rows = getDb().prepare(`SELECT p.id, p.title, p.price, p.stock, p.is_published, p.created_at, c.name AS category,
      (SELECT thumb_path FROM product_images WHERE product_id = p.id ORDER BY is_main DESC, position LIMIT 1) AS thumb,
      COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN seller_orders so ON so.id = oi.seller_order_id
        WHERE oi.product_id = p.id AND so.status != 'cancelled'), 0) AS units_sold
    FROM products p JOIN categories c ON c.id = p.category_id WHERE p.seller_id = ? ORDER BY p.id DESC`).all(req.user.id);
  res.json({
    items: rows.map((p) => ({ id: p.id, title: p.title, price: p.price, stock: p.stock, isPublished: !!p.is_published, createdAt: p.created_at, category: p.category, thumb: p.thumb, unitsSold: p.units_sold })),
  });
});

r.get('/seller/products/:id', (req, res) => {
  const id = idParam(req.params.id);
  const db = getDb();
  const p = id && db.prepare('SELECT * FROM products WHERE id = ? AND seller_id = ?').get(id, req.user.id);
  if (!p) throw notFound('Product not found');
  const images = db.prepare('SELECT thumb_path, large_path FROM product_images WHERE product_id = ? ORDER BY is_main DESC, position').all(id);
  res.json({
    product: {
      id: p.id, title: p.title, description: p.description, price: p.price, stock: p.stock, categoryId: p.category_id, isPublished: !!p.is_published,
      images: images.map((i) => ({ key: keyFromPath(i.large_path), thumb: i.thumb_path, large: i.large_path })),
    },
  });
});

r.post('/seller/products', async (req, res) => {
  const db = getDb();
  const b = validate(req.body, productRules(db));
  const images = await validateImages(req.body?.images);
  const id = db.transaction(() => {
    const ts = now();
    const pid = db.prepare(`INSERT INTO products (seller_id, category_id, title, description, price, stock, is_published, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(req.user.id, b.categoryId, b.title, b.description, b.price, b.stock, b.isPublished === false ? 0 : 1, ts, ts).lastInsertRowid;
    saveImages(db, pid, images);
    return pid;
  }).immediate();
  res.status(201).json({ product: { id } });
});

r.put('/seller/products/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const db = getDb();
  if (!id || !db.prepare('SELECT 1 FROM products WHERE id = ? AND seller_id = ?').get(id, req.user.id)) throw notFound('Product not found');
  const b = validate(req.body, productRules(db));
  const images = await validateImages(req.body?.images);
  db.transaction(() => {
    db.prepare(`UPDATE products SET category_id = ?, title = ?, description = ?, price = ?, stock = ?, is_published = COALESCE(?, is_published), updated_at = ?
      WHERE id = ? AND seller_id = ?`).run(b.categoryId, b.title, b.description, b.price, b.stock, b.isPublished === undefined ? null : b.isPublished ? 1 : 0, now(), id, req.user.id);
    saveImages(db, id, images);
  }).immediate();
  res.json({ product: { id } });
});

/** Publish / unpublish (DR-3: products are never deleted once ordered; we never delete). */
r.patch('/seller/products/:id', (req, res) => {
  const id = idParam(req.params.id);
  const b = validate(req.body, { isPublished: [required('isPublished'), bool()] });
  const info = id && getDb().prepare('UPDATE products SET is_published = ?, updated_at = ? WHERE id = ? AND seller_id = ?').run(b.isPublished ? 1 : 0, now(), id, req.user.id);
  if (!info?.changes) throw notFound('Product not found');
  res.json({ product: { id, isPublished: b.isPublished } });
});

// ---------- Orders (FR-9) ----------
r.get('/seller/orders', (req, res) => {
  const db = getDb();
  const status = STATUSES.includes(req.query.status) ? req.query.status : null;
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of db.prepare('SELECT status, COUNT(*) n FROM seller_orders WHERE seller_id = ? GROUP BY status').all(req.user.id)) counts[row.status] = row.n;
  const rows = db.prepare(`SELECT so.id, so.order_id, so.status, so.subtotal, so.created_at, o.recipient, o.region, o.city,
      (SELECT SUM(quantity) FROM order_items WHERE seller_order_id = so.id) AS units
    FROM seller_orders so JOIN orders o ON o.id = so.order_id
    WHERE so.seller_id = ? ${status ? 'AND so.status = ?' : ''} ORDER BY so.id DESC LIMIT 200`).all(...[req.user.id, ...(status ? [status] : [])]);
  res.json({
    counts,
    items: rows.map((r) => ({ id: r.id, number: orderNumber(r.order_id), status: r.status, subtotal: r.subtotal, createdAt: r.created_at, recipient: r.recipient, region: r.region, city: r.city, units: r.units })),
  });
});

function loadSellerOrder(db, id, sellerId) {
  // DR-8: scoped to the seller.
  const so = db.prepare(`SELECT so.*, o.recipient, o.phone, o.region, o.city, o.street, o.building, o.apartment, o.note
    FROM seller_orders so JOIN orders o ON o.id = so.order_id WHERE so.id = ? AND so.seller_id = ?`).get(id, sellerId);
  if (!so) return null;
  return {
    id: so.id, number: orderNumber(so.order_id), status: so.status, createdAt: so.created_at, cashToCollect: so.subtotal,
    address: { recipient: so.recipient, phone: so.phone, region: so.region, city: so.city, street: so.street, building: so.building, apartment: so.apartment, note: so.note },
    items: db.prepare('SELECT product_id AS productId, title, unit_price AS unitPrice, quantity FROM order_items WHERE seller_order_id = ? ORDER BY id').all(so.id),
    allowedMoves: allowedMoves(so.status, 'seller'),
    history: historyOf(db, so.id),
  };
}

r.get('/seller/orders/:id', (req, res) => {
  const id = idParam(req.params.id);
  const order = id && loadSellerOrder(getDb(), id, req.user.id);
  if (!order) throw notFound('Order not found');
  res.json({ order });
});

r.post('/seller/orders/:id/status', (req, res) => {
  const id = idParam(req.params.id);
  const db = getDb();
  if (!id || !db.prepare('SELECT 1 FROM seller_orders WHERE id = ? AND seller_id = ?').get(id, req.user.id)) throw notFound('Order not found');
  const b = validate(req.body, { status: [required('Status'), oneOf(STATUSES)] });
  transition(db, id, b.status, { id: req.user.id, role: 'seller' });
  res.json({ order: loadSellerOrder(db, id, req.user.id) });
});

// ---------- Stats (FR-10) ----------
r.get('/seller/stats', (req, res) => {
  const db = getDb();
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of db.prepare('SELECT status, COUNT(*) n FROM seller_orders WHERE seller_id = ? GROUP BY status').all(req.user.id)) byStatus[row.status] = row.n;
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const revenue = db.prepare(`SELECT COALESCE(SUM(so.subtotal), 0) AS total, COUNT(*) AS n FROM seller_orders so
    WHERE so.seller_id = ? AND so.status = 'delivered'
      AND (SELECT MAX(created_at) FROM status_history h WHERE h.seller_order_id = so.id AND h.to_status = 'delivered') >= ?`).get(req.user.id, since);
  const products = db.prepare('SELECT COUNT(*) AS total, SUM(is_published) AS published, SUM(stock = 0) AS soldOut FROM products WHERE seller_id = ?').get(req.user.id);
  res.json({
    toConfirm: byStatus.placed, toShip: byStatus.confirmed, byStatus,
    revenue30d: revenue.total, delivered30d: revenue.n,
    products: { total: products.total, published: products.published || 0, soldOut: products.soldOut || 0 },
  });
});

export default r;
