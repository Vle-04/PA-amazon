// The nine break-it tests from the PRD. Runs against any deployment:
//   BASE_URL=https://your-app.fly.dev npm run test:break-it
// Test 8 needs direct database access; it runs locally when the DB file is reachable,
// otherwise run backend/tests/fk-test.mjs on the server.
import sharp from 'sharp';
import fs from 'node:fs';

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
// Test accounts must be email-verified; the server returns the code only to clients with this token.
const TEST_TOKEN = process.env.TEST_AUTH_TOKEN || 'dev-test-token';
const run = Date.now().toString(36);
let passed = 0;
let failed = 0;
const results = [];

class Client {
  constructor(name) { this.name = name; this.cookie = ''; }
  async req(method, path, body, { raw } = {}) {
    const headers = { 'x-test-token': TEST_TOKEN };
    if (this.cookie) headers.cookie = this.cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return raw ? { status: res.status, json, text } : { status: res.status, ...json };
  }
  get(p) { return this.req('GET', p); }
  post(p, b) { return this.req('POST', p, b ?? {}); }
  put(p, b) { return this.req('PUT', p, b); }
  patch(p, b) { return this.req('PATCH', p, b); }
}

async function user(label, { seller } = {}) {
  const c = new Client(label);
  const email = `${label}-${run}@test.am`;
  const r = await c.post('/api/auth/register', { email, password: 'password123', name: label, phone: '+374 91 000000' });
  if (r.status !== 201) throw new Error(`register ${label}: ${JSON.stringify(r)}`);
  if (!r.user) {
    // Server has EMAIL_VERIFICATION=on: confirm with the code it returns to test clients.
    if (!r.testCode) throw new Error('No test code returned: set TEST_AUTH_TOKEN to the same value as on the server');
    const v = await c.post('/api/auth/verify-email', { email, code: r.testCode });
    if (v.status !== 200) throw new Error(`verify ${label}: ${JSON.stringify(v)}`);
  }
  if (seller) await c.post('/api/me/seller', { storeName: `Store ${label}`, storePhone: '+374 91 000000' });
  return c;
}

let imgBuf;
async function uploadImage(c) {
  imgBuf ??= await sharp({ create: { width: 800, height: 600, channels: 3, background: '#3a7' } }).jpeg().toBuffer();
  const fd = new FormData();
  fd.append('image', new Blob([imgBuf], { type: 'image/jpeg' }), 'photo.jpg');
  const r = await c.req('POST', '/api/uploads', fd);
  if (r.status !== 201) throw new Error('upload failed ' + JSON.stringify(r));
  return r.image.key;
}

let categoryId;
async function product(seller, { price = 1000, stock = 10, title = 'Test product' } = {}) {
  categoryId ??= (await seller.get('/api/categories')).categories[0].id;
  const key = await uploadImage(seller);
  const r = await seller.post('/api/seller/products', { title, description: 'A product created by the break-it tests.', price, stock, categoryId, images: [key] });
  if (r.status !== 201) throw new Error('create product ' + JSON.stringify(r));
  return r.product.id;
}

const address = { recipient: 'Test Buyer', phone: '+374 91 123456', region: 'Yerevan', city: 'Yerevan', street: 'Abovyan', building: '1', apartment: '2' };
const key = () => `k-${crypto.randomUUID()}`;
const checkout = (c, requestKey = key()) => c.post('/api/orders', { ...address, requestKey });
const stockOf = async (id) => (await new Client('anon').get(`/api/products/${id}`)).product?.stock;

async function test(n, name, fn) {
  try {
    const detail = await fn();
    passed++;
    results.push(`✅ ${n}. ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    failed++;
    results.push(`❌ ${n}. ${name} — ${e.message}`);
  }
  console.log(results.at(-1));
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log(`Break-it tests against ${BASE}\n`);
const seller = await user('seller', { seller: true });
const seller2 = await user('seller2', { seller: true });

await test(1, 'Last units: stock 3, 30 simultaneous checkouts', async () => {
  const pid = await product(seller, { stock: 3, title: 'Last three units' });
  const buyers = await Promise.all(Array.from({ length: 30 }, (_, i) => user(`race${i}`)));
  for (const b of buyers) assert((await b.post('/api/cart/items', { productId: pid, quantity: 1 })).status === 201, 'add to cart failed');
  const res = await Promise.all(buyers.map((b) => b.req('POST', '/api/orders', { ...address, requestKey: key() }, { raw: true })));
  const created = res.filter((r) => r.status === 201).length;
  const conflicts = res.filter((r) => r.status === 409).length;
  const locked = res.filter((r) => /locked|busy/i.test(r.text)).length;
  const stock = await stockOf(pid);
  assert(created === 3 && conflicts === 27 && stock === 0 && locked === 0, `created=${created} 409s=${conflicts} stock=${stock} locked=${locked}`);
  return `3 orders, 27 × 409, stock 0, no lock errors`;
});

await test(2, 'Double click: same checkout twice with the same request key', async () => {
  const pid = await product(seller, { stock: 10 });
  const b = await user('double');
  await b.post('/api/cart/items', { productId: pid, quantity: 2 });
  const k = key();
  const [a, c] = await Promise.all([checkout(b, k), checkout(b, k)]);
  const again = await checkout(b, k);
  const list = await b.get('/api/orders');
  assert(a.order && c.order && a.order.id === c.order.id && again.order.id === a.order.id, 'different orders returned');
  assert(list.total === 1, `buyer has ${list.total} orders`);
  assert((await stockOf(pid)) === 8, 'stock reduced more than once');
  return `one order (${a.order.number}), statuses ${[a.status, c.status, again.status].join('/')}`;
});

await test(3, 'Price changed after item is in the cart', async () => {
  const pid = await product(seller, { price: 5000, stock: 10, title: 'Price will change' });
  const b = await user('pricechange');
  await b.post('/api/cart/items', { productId: pid, quantity: 1 });
  const edit = await seller.get(`/api/seller/products/${pid}`);
  const p = edit.product;
  await seller.put(`/api/seller/products/${pid}`, { ...p, price: 6500, images: p.images.map((i) => i.key) });
  const r = await checkout(b);
  assert(r.status === 409 && r.error.code === 'PRICE_CHANGED', `expected 409 PRICE_CHANGED, got ${r.status}`);
  assert(r.error.items[0].newPrice === 6500 && r.error.items[0].oldPrice === 5000, 'new price not reported');
  const cart = await b.get('/api/cart');
  assert(!cart.cart.canCheckout && cart.cart.warnings.some((w) => w.includes('6500')), 'cart does not warn');
  assert((await b.get('/api/orders')).total === 0, 'an order was created');
  await b.post('/api/cart/accept-prices');
  const ok = await checkout(b);
  assert(ok.status === 201 && ok.order.total === 6500, 'checkout after accepting failed');
  return '409 PRICE_CHANGED 5000 → 6500; succeeds after buyer accepts';
});

let orderForLater;
await test(4, 'Old order keeps old title and price after edit', async () => {
  const pid = await product(seller, { price: 3000, stock: 10, title: 'Original title' });
  const b = await user('oldorder');
  await b.post('/api/cart/items', { productId: pid, quantity: 1 });
  const o = (await checkout(b)).order;
  const p = (await seller.get(`/api/seller/products/${pid}`)).product;
  await seller.put(`/api/seller/products/${pid}`, { ...p, title: 'Edited title', price: 9999, images: p.images.map((i) => i.key) });
  const again = (await b.get(`/api/orders/${o.id}`)).order;
  const item = again.parts[0].items[0];
  assert(item.title === 'Original title' && item.unitPrice === 3000 && again.total === 3000, `order shows ${item.title} ${item.unitPrice}`);
  orderForLater = { buyer: b, order: o, pid };
  return 'order still shows "Original title" at 3000 ֏';
});

await test(5, "Someone else's order: cross-buyer and cross-seller access by id", async () => {
  const { order } = orderForLater;
  const stranger = await user('stranger');
  const partId = order.parts[0].id;
  const checks = [
    await stranger.get(`/api/orders/${order.id}`),
    await stranger.post(`/api/orders/${order.id}/parts/${partId}/cancel`),
    await seller2.get(`/api/seller/orders/${partId}`),
    await seller2.post(`/api/seller/orders/${partId}/status`, { status: 'confirmed' }),
    await stranger.get(`/api/seller/orders/${partId}`),
  ];
  for (const c of checks) {
    assert([403, 404].includes(c.status), `got ${c.status}`);
    assert(!c.order && !c.address, 'data leaked');
  }
  const still = (await orderForLater.buyer.get(`/api/orders/${order.id}`)).order;
  assert(still.parts[0].status === 'placed', 'status changed');
  return checks.map((c) => c.status).join(', ');
});

await test(6, 'Move not allowed: Placed → Delivered; buyer cancels a shipped order', async () => {
  const { buyer, order } = orderForLater;
  const partId = order.parts[0].id;
  const jump = await seller.post(`/api/seller/orders/${partId}/status`, { status: 'delivered' });
  assert(jump.status === 409, `placed→delivered gave ${jump.status}`);
  const h1 = (await seller.get(`/api/seller/orders/${partId}`)).order;
  assert(h1.status === 'placed' && h1.history.length === 1, 'state changed');
  await seller.post(`/api/seller/orders/${partId}/status`, { status: 'confirmed' });
  await seller.post(`/api/seller/orders/${partId}/status`, { status: 'shipped' });
  const stockBefore = await stockOf(orderForLater.pid);
  const cancel = await buyer.post(`/api/orders/${order.id}/parts/${partId}/cancel`);
  assert(cancel.status === 409, `cancel shipped gave ${cancel.status}`);
  const h2 = (await seller.get(`/api/seller/orders/${partId}`)).order;
  assert(h2.status === 'shipped' && h2.history.length === 3 && (await stockOf(orderForLater.pid)) === stockBefore, 'state changed');
  const buyerConfirm = await buyer.post(`/api/seller/orders/${partId}/status`, { status: 'delivered' });
  assert([403, 404].includes(buyerConfirm.status), 'buyer could move seller order');
  return 'both 409, status and history unchanged';
});

await test(7, 'Cancel returns stock', async () => {
  const pid = await product(seller, { stock: 10 });
  const b = await user('canceller');
  await b.post('/api/cart/items', { productId: pid, quantity: 4 });
  const o = (await checkout(b)).order;
  const before = await stockOf(pid);
  const r = await b.post(`/api/orders/${o.id}/parts/${o.parts[0].id}/cancel`);
  const after = await stockOf(pid);
  assert(r.status === 200 && before === 6 && after === 10, `stock ${before} → ${after}`);
  const twice = await b.post(`/api/orders/${o.id}/parts/${o.parts[0].id}/cancel`);
  assert(twice.status === 409 && (await stockOf(pid)) === 10, 'second cancel changed stock');
  return `stock 6 → 10; repeated cancel 409`;
});

await test(8, 'Foreign keys: order item for a nonexistent product', async () => {
  const { DB_PATH } = await import('../src/config.js');
  const local = /localhost|127\.0\.0\.1/.test(BASE) && fs.existsSync(DB_PATH);
  if (!local) throw new Error('needs DB access: run on the server: fly ssh console -C "node /app/backend/tests/fk-test.mjs"');
  const { openDb } = await import('../src/db.js');
  const db = openDb();
  try {
    db.prepare('INSERT INTO order_items (seller_order_id, product_id, title, unit_price, quantity) VALUES (?,?,?,?,?)').run(1, 999999999, 'ghost', 100, 1);
    throw new Error('insert accepted');
  } catch (e) {
    assert(e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY', e.message);
  } finally { db.close(); }
  return 'SQLITE_CONSTRAINT_FOREIGNKEY';
});

await test(9, 'Bad upload: 30 MB file and a renamed .exe', async () => {
  const big = new FormData();
  big.append('image', new Blob([Buffer.alloc(30 * 1024 * 1024, 1)], { type: 'image/jpeg' }), 'huge.jpg');
  const r1 = await seller.req('POST', '/api/uploads', big);
  const exe = new FormData();
  const mz = Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff', 'binary'), Buffer.alloc(4096, 0)]);
  exe.append('image', new Blob([mz], { type: 'image/jpeg' }), 'cute-cat.jpg');
  const r2 = await seller.req('POST', '/api/uploads', exe);
  assert(r1.status === 400 && r1.error?.message, `30MB gave ${r1.status}`);
  assert(r2.status === 400 && r2.error?.message, `exe gave ${r2.status}`);
  return `"${r1.error.message}" / "${r2.error.message}"`;
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
