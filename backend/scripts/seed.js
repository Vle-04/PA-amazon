// NFR-5 seed: categories, 3 sellers, 40+ products with images, 2 demo buyers,
// plus a few delivered orders with reviews so ratings and stats are not empty.
// Usage: node scripts/seed.js [--force]   (--force wipes existing data first)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
import { openDb, migrate, now } from '../src/db.js';
import { UPLOADS_DIR, DB_PATH, ROOT } from '../src/config.js';
import { imagePaths } from '../src/images.js';

const force = process.argv.includes('--force');
const db = openDb();
migrate(db);

if (db.prepare('SELECT COUNT(*) n FROM categories').get().n > 0) {
  if (!force) { console.log('Database already seeded. Use --force to wipe and reseed.'); process.exit(0); }
  db.exec(`PRAGMA foreign_keys = OFF;
    DROP TRIGGER IF EXISTS status_history_no_delete;
    DELETE FROM reviews; DELETE FROM status_history; DELETE FROM order_items; DELETE FROM seller_orders; DELETE FROM orders;
    DELETE FROM cart_items; DELETE FROM product_images; DELETE FROM products; DELETE FROM categories; DELETE FROM users;
    CREATE TRIGGER status_history_no_delete BEFORE DELETE ON status_history BEGIN SELECT RAISE(ABORT, 'status_history is insert-only'); END;
    PRAGMA foreign_keys = ON;`);
}

const CATEGORIES = [
  ['Electronics', 'electronics', 210], ['Home & Kitchen', 'home-kitchen', 30], ['Clothing', 'clothing', 340],
  ['Books', 'books', 20], ['Food & Drinks', 'food-drinks', 120], ['Handmade & Crafts', 'handmade', 0],
  ['Sports & Outdoors', 'sports', 160], ['Beauty & Health', 'beauty', 300], ['Toys & Kids', 'toys', 50],
];

const PRODUCTS = {
  electronics: [
    ['Wireless Earbuds Pro', 'Bluetooth 5.3 earbuds with active noise cancelling, 30 hours of battery with the case and USB-C charging.', 24900],
    ['Smartphone Stand Aluminium', 'Adjustable aluminium stand for phones and small tablets. Non-slip pads, folds flat for travel.', 6500],
    ['USB-C Fast Charger 65W', 'GaN charger with two USB-C and one USB-A port. Charges a laptop and a phone at the same time.', 14500],
    ['Mechanical Keyboard Armenian Layout', 'Hot-swappable mechanical keyboard with Armenian and English keycaps, brown switches and white backlight.', 39000],
    ['Portable Power Bank 20000mAh', 'Slim power bank with fast charging and a small display that shows the remaining charge.', 16900],
    ['Smart LED Bulb', 'Wi-Fi LED bulb with 16 million colours, schedules and voice assistant support. E27 socket.', 4900],
  ],
  'home-kitchen': [
    ['Copper Jazzve for Armenian Coffee', 'Hand-hammered copper jazzve with a wooden handle, 300 ml. Makes three small cups of strong Armenian coffee.', 8900],
    ['Ceramic Coffee Cup Set', 'Set of six hand-painted ceramic coffee cups with saucers, traditional pomegranate pattern.', 18500],
    ['Cast Iron Pan 28cm', 'Pre-seasoned cast iron pan for khorovats vegetables, eggs and anything you want crispy.', 21000],
    ['Lavash Storage Bag', 'Breathable linen bag that keeps lavash soft for days. Machine washable.', 3500],
    ['Glass Jars for Preserves (6 pcs)', 'Six 0.5 litre glass jars with twist-off lids for jams, pickles and compote.', 5200],
    ['Wool Blanket', 'Warm wool blanket woven in Gyumri, 150 by 200 cm, natural undyed colours.', 32000],
  ],
  clothing: [
    ['Cotton T-Shirt "Ararat"', 'Soft organic cotton t-shirt with a minimal print of Mount Ararat. Unisex fit.', 7900],
    ['Knitted Wool Socks', 'Hand-knitted wool socks with a traditional ornament. Warm enough for Dilijan winters.', 4500],
    ['Denim Jacket', 'Classic blue denim jacket with metal buttons and two chest pockets.', 26500],
    ['Hooded Sweatshirt', 'Heavy fleece hoodie with a kangaroo pocket. Available in graphite grey.', 15900],
    ['Leather Belt', 'Genuine leather belt with a brass buckle, made in Yerevan.', 9800],
  ],
  books: [
    ['Armenian Cookbook', 'One hundred family recipes from every region of Armenia, from tolma to gata, with photos.', 11000],
    ['History of Armenia Illustrated', 'An illustrated history from Urartu to the present day for curious readers of all ages.', 14500],
    ['Learn Armenian Alphabet Workbook', 'Workbook for children and adults to learn the 39 letters of the Armenian alphabet.', 4200],
    ['Hovhannes Tumanyan Tales', 'Collected fairy tales by Hovhannes Tumanyan in a hardcover edition with colour illustrations.', 8500],
    ['Programming in JavaScript', 'A practical introduction to JavaScript with exercises, from variables to web servers.', 13500],
  ],
  'food-drinks': [
    ['Apricot Jam Homemade', 'Homemade apricot jam from Ararat valley apricots, 450 g jar. No preservatives.', 2800],
    ['Dried Fruit Mix', 'Mix of dried apricots, plums, figs and peaches from local farms, 500 g.', 4600],
    ['Mountain Herbal Tea (Thyme)', 'Wild thyme collected in the mountains of Syunik, 100 g. Great with honey.', 2400],
    ['Sujukh with Walnuts', 'Traditional walnut sujukh dipped in grape syrup, 3 pieces.', 3900],
    ['Mountain Honey 1kg', 'Raw wildflower honey from Tavush beekeepers, 1 kg glass jar.', 9500],
    ['Gata Sweet Bread', 'Traditional Armenian gata with a sweet buttery filling, baked fresh every morning.', 2200],
  ],
  handmade: [
    ['Handwoven Carpet Small', 'Small handwoven wool carpet, 60 by 90 cm, natural dyes and a classic Artsakh pattern.', 85000],
    ['Pomegranate Ceramic Figurine', 'Hand-painted ceramic pomegranate, a symbol of fertility and luck. 10 cm tall.', 6900],
    ['Obsidian Necklace', 'Black obsidian pendant on a leather cord, stone from the Armenian highlands.', 7500],
    ['Wooden Carved Box', 'Walnut wood box with a carved khachkar ornament, perfect for jewellery.', 15500],
    ['Silver Earrings with Ornament', 'Sterling silver earrings with an eternity sign ornament, handmade in Yerevan.', 19800],
  ],
  sports: [
    ['Hiking Backpack 40L', 'Lightweight hiking backpack with rain cover, ideal for trips to Aragats and Dilijan.', 27500],
    ['Yoga Mat', 'Non-slip yoga mat 6 mm thick with a carrying strap.', 8900],
    ['Football Size 5', 'Match football with hand-stitched panels, size 5.', 9900],
    ['Trekking Poles (Pair)', 'Adjustable aluminium trekking poles with cork handles.', 12900],
    ['Insulated Water Bottle', 'Stainless steel bottle keeps drinks cold 24 hours or hot 12 hours, 750 ml.', 6900],
  ],
  beauty: [
    ['Natural Olive Soap', 'Cold-process olive oil soap with lavender, made in small batches.', 1900],
    ['Rose Water Toner', 'Rose water from Armenian damask roses, 200 ml, for all skin types.', 3600],
    ['Beard Oil', 'Blend of argan and jojoba oil with a light cedar scent, 30 ml.', 4900],
    ['Hand Cream with Sea Buckthorn', 'Rich hand cream with sea buckthorn oil for dry winter skin, 75 ml.', 2900],
    ['Hair Brush Wooden', 'Wooden hair brush with natural bristles, reduces frizz.', 5400],
  ],
  toys: [
    ['Wooden Building Blocks', 'Set of 50 painted wooden blocks for children from 2 years.', 11500],
    ['Plush Bear', 'Soft plush bear, 35 cm, washable.', 6800],
    ['Puzzle 1000 pieces "Yerevan"', 'A 1000 piece puzzle with a panorama of Yerevan and Mount Ararat.', 7200],
    ['Kids Backgammon (Nardi) Set', 'Small wooden nardi set to learn the national game, with dice and checkers.', 13900],
  ],
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function wrap(text, max = 16) {
  const lines = [''];
  for (const w of text.split(' ')) {
    if ((lines.at(-1) + ' ' + w).trim().length > max) lines.push(w);
    else lines[lines.length - 1] = (lines.at(-1) + ' ' + w).trim();
  }
  return lines.slice(0, 3);
}

// Real product photos (CC0 / public domain, see seed-images/CREDITS.md) named <title-slug>-<n>.jpg.
const PHOTOS_DIR = path.join(ROOT, 'seed-images');
const titleSlug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const photosFor = (title) => (fs.existsSync(PHOTOS_DIR) ? fs.readdirSync(PHOTOS_DIR) : [])
  .filter((f) => new RegExp(`^${titleSlug(title)}-\\d+\\.(jpe?g|png|webp)$`).test(f)).sort()
  .map((f) => path.join(PHOTOS_DIR, f)).slice(0, 5);

async function storePhoto(file) {
  const key = crypto.randomBytes(16).toString('hex');
  const img = sharp(file).rotate();
  await img.clone().resize(400, 400, { fit: 'cover', position: 'attention' }).webp({ quality: 78 }).toFile(path.join(UPLOADS_DIR, `${key}_thumb.webp`));
  await img.clone().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(UPLOADS_DIR, `${key}_large.webp`));
  return key;
}

async function makeImage(title, hue, variant) {
  const h2 = (hue + 40 + variant * 25) % 360;
  const lines = wrap(title);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},55%,${variant ? 38 : 48}%)"/><stop offset="1" stop-color="hsl(${h2},60%,${variant ? 22 : 30}%)"/></linearGradient></defs>
    <rect width="1000" height="1000" fill="url(#g)"/>
    <circle cx="${variant ? 780 : 220}" cy="${variant ? 230 : 780}" r="${180 + variant * 60}" fill="white" fill-opacity="0.08"/>
    <text x="500" y="${430 - lines.length * 40}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="84" fill="white">
      ${lines.map((l, i) => `<tspan x="500" dy="${i ? 100 : 0}">${esc(l)}</tspan>`).join('')}
    </text>
    <text x="500" y="880" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="white" fill-opacity="0.7">SHUKA${variant ? ' · photo ' + (variant + 1) : ''}</text>
  </svg>`;
  const key = crypto.randomBytes(16).toString('hex');
  const buf = Buffer.from(svg);
  await sharp(buf).resize(400, 400).webp({ quality: 75 }).toFile(path.join(UPLOADS_DIR, `${key}_thumb.webp`));
  await sharp(buf).resize(1000, 1000).webp({ quality: 80 }).toFile(path.join(UPLOADS_DIR, `${key}_large.webp`));
  return key;
}

const PASSWORD = 'password123';
const hash = bcrypt.hashSync(PASSWORD, 10);
const ts0 = Date.now();
const iso = (minsAgo) => new Date(ts0 - minsAgo * 60_000).toISOString();

// Generate images first: no file I/O inside transactions (NFR-1).
const imagePlan = [];
let n = 0;
for (const [, slug, hue] of CATEGORIES) {
  for (const [title] of PRODUCTS[slug]) {
    const photos = photosFor(title);
    const keys = photos.length
      ? await Promise.all(photos.map(storePhoto))
      : [await makeImage(title, hue, 0), await makeImage(title, hue, 1)];
    imagePlan.push({ slug, title, keys, i: n++ });
  }
}

db.transaction(() => {
  const insCat = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
  const catId = {};
  for (const [name, slug] of CATEGORIES) catId[slug] = insCat.run(name, slug).lastInsertRowid;

  const insUser = db.prepare('INSERT INTO users (email, password_hash, name, phone, is_seller, store_name, store_phone, created_at, email_verified) VALUES (?,?,?,?,?,?,?,?,1)');
  const sellers = [
    insUser.run('ani@shuka.am', hash, 'Ani Petrosyan', '+374 91 111111', 1, 'Ani Crafts', '+374 91 111111', iso(60 * 24 * 90)).lastInsertRowid,
    insUser.run('gor@shuka.am', hash, 'Gor Hakobyan', '+374 93 222222', 1, 'Gor Electronics', '+374 93 222222', iso(60 * 24 * 90)).lastInsertRowid,
    insUser.run('lilit@shuka.am', hash, 'Lilit Sargsyan', '+374 94 333333', 1, 'Lilit Market', '+374 94 333333', iso(60 * 24 * 90)).lastInsertRowid,
  ];
  const buyers = [
    insUser.run('buyer1@shuka.am', hash, 'Armen Grigoryan', '+374 77 444444', 0, null, null, iso(60 * 24 * 60)).lastInsertRowid,
    insUser.run('buyer2@shuka.am', hash, 'Nare Avetisyan', '+374 98 555555', 0, null, null, iso(60 * 24 * 60)).lastInsertRowid,
  ];
  const sellerFor = { electronics: 1, sports: 1, toys: 1, handmade: 0, clothing: 0, beauty: 0, 'home-kitchen': 2, books: 2, 'food-drinks': 2 };

  const insProd = db.prepare(`INSERT INTO products (seller_id, category_id, title, description, price, stock, is_published, created_at, updated_at)
    VALUES (?,?,?,?,?,?,1,?,?)`);
  const insImg = db.prepare('INSERT INTO product_images (product_id, thumb_path, large_path, position, is_main) VALUES (?,?,?,?,?)');
  const products = [];
  for (const plan of imagePlan) {
    const [title, desc, price] = PRODUCTS[plan.slug].find((p) => p[0] === plan.title);
    const created = iso(60 * 24 * 30 - plan.i * 600);
    const sellerId = sellers[sellerFor[plan.slug]];
    const stock = [3, 5, 8, 12, 20, 25, 40][plan.i % 7];
    const pid = insProd.run(sellerId, catId[plan.slug], title, desc, price, stock, created, created).lastInsertRowid;
    plan.keys.forEach((k, idx) => { const p = imagePaths(k); insImg.run(pid, p.thumb, p.large, idx, idx === 0 ? 1 : 0); });
    products.push({ id: pid, title, price, sellerId });
  }

  // A few historical delivered orders with reviews so ratings, stats and sorting have data.
  const insOrder = db.prepare(`INSERT INTO orders (buyer_id, request_key, recipient, phone, region, city, street, building, apartment, note, total, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insSo = db.prepare('INSERT INTO seller_orders (order_id, seller_id, status, subtotal, created_at, updated_at) VALUES (?,?,?,?,?,?)');
  const insItem = db.prepare('INSERT INTO order_items (seller_order_id, product_id, title, unit_price, quantity) VALUES (?,?,?,?,?)');
  const insHist = db.prepare('INSERT INTO status_history (seller_order_id, from_status, to_status, actor_id, actor_role, created_at) VALUES (?,?,?,?,?,?)');
  const insReview = db.prepare('INSERT INTO reviews (product_id, buyer_id, rating, text, created_at) VALUES (?,?,?,?,?)');
  const reviewTexts = { 5: 'Excellent, exactly as described. Fast delivery!', 4: 'Very good quality, would buy again.', 3: 'Okay for the price.' };
  const history = [
    [0, [0, 6, 12], [5, 4, 5]], [1, [1, 18, 30], [4, 5, 5]], [0, [24, 36, 7], [5, 3, 4]], [1, [2, 25, 40], [5, 4, 4]],
  ];
  history.forEach(([b, idxs, ratings], h) => {
    const items = idxs.map((i) => products[i % products.length]);
    const minsAgo = 60 * 24 * (12 - h * 2);
    const total = items.reduce((s, p) => s + p.price, 0);
    const oid = insOrder.run(buyers[b], `seed-${h}-${crypto.randomUUID()}`, b ? 'Nare Avetisyan' : 'Armen Grigoryan', b ? '+374 98 555555' : '+374 77 444444',
      'Yerevan', 'Yerevan', b ? 'Abovyan St' : 'Tumanyan St', String(10 + h), String(5 + h), '', total, iso(minsAgo)).lastInsertRowid;
    for (const [sellerId, group] of Map.groupBy(items, (p) => p.sellerId)) {
      const so = insSo.run(oid, sellerId, 'delivered', group.reduce((s, p) => s + p.price, 0), iso(minsAgo), iso(minsAgo - 3000)).lastInsertRowid;
      group.forEach((p) => insItem.run(so, p.id, p.title, p.price, 1));
      insHist.run(so, null, 'placed', buyers[b], 'buyer', iso(minsAgo));
      insHist.run(so, 'placed', 'confirmed', sellerId, 'seller', iso(minsAgo - 60));
      insHist.run(so, 'confirmed', 'shipped', sellerId, 'seller', iso(minsAgo - 1440));
      insHist.run(so, 'shipped', 'delivered', sellerId, 'seller', iso(minsAgo - 3000));
    }
    items.forEach((p, k) => {
      try { insReview.run(p.id, buyers[b], ratings[k], reviewTexts[ratings[k]], iso(minsAgo - 3100)); } catch { /* duplicate pair */ }
    });
  });
}).immediate();

const count = db.prepare('SELECT COUNT(*) n FROM products').get().n;
console.log(`Seeded ${CATEGORIES.length} categories, 3 sellers, 2 buyers, ${count} products into ${DB_PATH}`);
console.log(`Demo logins (password "${PASSWORD}"): sellers ani@shuka.am, gor@shuka.am, lilit@shuka.am; buyers buyer1@shuka.am, buyer2@shuka.am`);
db.close();
