import { Router } from 'express';
import { getDb, now } from '../db.js';
import { requireUser } from '../auth.js';
import { notFound, conflict, forbidden } from '../errors.js';
import { validate, required, str, int, idParam } from '../validate.js';

const r = Router();

const ratingJoin = `LEFT JOIN (SELECT product_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count FROM reviews GROUP BY product_id) rv ON rv.product_id = p.id`;

export const cardFields = `p.id, p.title, p.price, p.stock, p.created_at, p.is_published, p.category_id,
  c.name AS category_name, c.slug AS category_slug, u.store_name,
  (SELECT thumb_path FROM product_images WHERE product_id = p.id ORDER BY is_main DESC, position LIMIT 1) AS thumb,
  rv.avg_rating, COALESCE(rv.review_count, 0) AS review_count`;

export const toCard = (p) => ({
  id: p.id, title: p.title, price: p.price, stock: p.stock, createdAt: p.created_at,
  category: { id: p.category_id, name: p.category_name, slug: p.category_slug },
  storeName: p.store_name, thumb: p.thumb,
  rating: p.avg_rating == null ? null : Math.round(p.avg_rating * 10) / 10, reviewCount: p.review_count,
});

r.get('/categories', (req, res) => {
  const rows = getDb().prepare(`SELECT c.id, c.name, c.slug, COUNT(p.id) AS count FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.is_published = 1 GROUP BY c.id ORDER BY c.name`).all();
  res.json({ categories: rows });
});

const SORTS = {
  newest: 'p.created_at DESC, p.id DESC',
  price_asc: 'p.price ASC, p.id DESC',
  price_desc: 'p.price DESC, p.id DESC',
  rating: 'COALESCE(rv.avg_rating, 0) DESC, COALESCE(rv.review_count, 0) DESC, p.id DESC',
};

/** FR-3: search, filter, sort, paginate. Bad query values fall back to defaults instead of failing. */
r.get('/products', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const sort = SORTS[req.query.sort] ? req.query.sort : 'newest';
  const page = Math.max(1, Math.min(10_000, parseInt(req.query.page, 10) || 1));
  const pageSize = Math.max(1, Math.min(48, parseInt(req.query.pageSize, 10) || 12));
  const minPrice = parseInt(req.query.minPrice, 10);
  const maxPrice = parseInt(req.query.maxPrice, 10);

  const where = ['p.is_published = 1'];
  const params = [];
  if (req.query.category) {
    where.push('c.slug = ?');
    params.push(String(req.query.category));
  }
  if (Number.isFinite(minPrice) && minPrice > 0) { where.push('p.price >= ?'); params.push(minPrice); }
  if (Number.isFinite(maxPrice) && maxPrice > 0) { where.push('p.price <= ?'); params.push(maxPrice); }
  for (const word of q.split(/\s+/).filter(Boolean).slice(0, 8)) {
    const like = `%${word.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
    where.push(`(p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')`);
    params.push(like, like);
  }
  const db = getDb();
  const base = `FROM products p JOIN categories c ON c.id = p.category_id JOIN users u ON u.id = p.seller_id ${ratingJoin} WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...params).n;
  const rows = db.prepare(`SELECT ${cardFields} ${base} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
  res.json({ items: rows.map(toCard), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), sort });
});

r.get('/products/:id', (req, res) => {
  const id = idParam(req.params.id);
  const db = getDb();
  const p = id && db.prepare(`SELECT ${cardFields}, p.description, p.seller_id FROM products p
    JOIN categories c ON c.id = p.category_id JOIN users u ON u.id = p.seller_id ${ratingJoin} WHERE p.id = ?`).get(id);
  // Unpublished products are visible only to their seller.
  if (!p || (!p.is_published && p.seller_id !== req.user?.id)) throw notFound('Product not found');
  const images = db.prepare('SELECT thumb_path AS thumb, large_path AS large, is_main FROM product_images WHERE product_id = ? ORDER BY is_main DESC, position').all(id);
  const reviews = db.prepare(`SELECT r.id, r.rating, r.text, r.created_at AS createdAt, u.name AS author FROM reviews r
    JOIN users u ON u.id = r.buyer_id WHERE r.product_id = ? ORDER BY r.id DESC LIMIT 100`).all(id);
  let canReview = false;
  let myReview = null;
  if (req.user) {
    myReview = db.prepare('SELECT id, rating, text, created_at AS createdAt FROM reviews WHERE product_id = ? AND buyer_id = ?').get(id, req.user.id) || null;
    canReview = !myReview && hasDeliveredPurchase(db, req.user.id, id);
  }
  res.json({
    product: {
      ...toCard(p), description: p.description, isPublished: !!p.is_published,
      isOwn: req.user?.id === p.seller_id, images, reviews, canReview, myReview,
    },
  });
});

export function hasDeliveredPurchase(db, buyerId, productId) {
  return !!db.prepare(`SELECT 1 FROM order_items oi JOIN seller_orders so ON so.id = oi.seller_order_id
    JOIN orders o ON o.id = so.order_id WHERE oi.product_id = ? AND o.buyer_id = ? AND so.status = 'delivered' LIMIT 1`).get(productId, buyerId);
}

/** FR-11: one review per buyer per product, only after delivery. */
r.post('/products/:id/reviews', requireUser, (req, res) => {
  const id = idParam(req.params.id);
  const db = getDb();
  if (!id || !db.prepare('SELECT 1 FROM products WHERE id = ?').get(id)) throw notFound('Product not found');
  const b = validate(req.body, { rating: [required('Rating'), int(1, 5)], text: [required('Review text'), str(2, 2000)] });
  if (!hasDeliveredPurchase(db, req.user.id, id)) throw forbidden('You can review only items delivered to you');
  try {
    const info = db.prepare('INSERT INTO reviews (product_id, buyer_id, rating, text, created_at) VALUES (?,?,?,?,?)')
      .run(id, req.user.id, b.rating, b.text, now());
    res.status(201).json({ review: { id: info.lastInsertRowid, rating: b.rating, text: b.text } });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict('ALREADY_REVIEWED', 'You already reviewed this product');
    throw e;
  }
});

export default r;
