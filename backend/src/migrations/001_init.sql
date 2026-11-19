-- 001: initial schema. Ten STRICT tables. Money is INTEGER dram. Dates are ISO-8601 TEXT.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  phone         TEXT    NOT NULL DEFAULT '',
  is_seller     INTEGER NOT NULL DEFAULT 0 CHECK (is_seller IN (0, 1)),
  store_name    TEXT,
  store_phone   TEXT,
  created_at    TEXT    NOT NULL
) STRICT;

CREATE TABLE categories (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
) STRICT;

CREATE TABLE products (
  id           INTEGER PRIMARY KEY,
  seller_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL,
  price        INTEGER NOT NULL CHECK (price > 0),
  stock        INTEGER NOT NULL CHECK (stock >= 0),
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
) STRICT;
CREATE INDEX products_seller ON products(seller_id);
CREATE INDEX products_cat_created ON products(category_id, created_at);
CREATE INDEX products_created ON products(created_at);
CREATE INDEX products_price ON products(price);

CREATE TABLE product_images (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  thumb_path TEXT    NOT NULL,
  large_path TEXT    NOT NULL,
  position   INTEGER NOT NULL,
  is_main    INTEGER NOT NULL DEFAULT 0 CHECK (is_main IN (0, 1))
) STRICT;
CREATE INDEX product_images_product ON product_images(product_id, position);

CREATE TABLE cart_items (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  price_seen INTEGER NOT NULL CHECK (price_seen > 0),
  added_at   TEXT    NOT NULL,
  PRIMARY KEY (user_id, product_id)
) STRICT;

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  buyer_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_key TEXT    NOT NULL,
  recipient   TEXT    NOT NULL,
  phone       TEXT    NOT NULL,
  region      TEXT    NOT NULL,
  city        TEXT    NOT NULL,
  street      TEXT    NOT NULL,
  building    TEXT    NOT NULL,
  apartment   TEXT    NOT NULL DEFAULT '',
  note        TEXT    NOT NULL DEFAULT '',
  total       INTEGER NOT NULL CHECK (total >= 0),
  created_at  TEXT    NOT NULL,
  UNIQUE (buyer_id, request_key)
) STRICT;
CREATE INDEX orders_buyer ON orders(buyer_id, created_at);

CREATE TABLE seller_orders (
  id         INTEGER PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  seller_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status     TEXT    NOT NULL CHECK (status IN ('placed','confirmed','shipped','delivered','cancelled')),
  subtotal   INTEGER NOT NULL CHECK (subtotal >= 0),
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  UNIQUE (order_id, seller_id)
) STRICT;
CREATE INDEX seller_orders_seller ON seller_orders(seller_id, status);

CREATE TABLE order_items (
  id              INTEGER PRIMARY KEY,
  seller_order_id INTEGER NOT NULL REFERENCES seller_orders(id) ON DELETE RESTRICT,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  title           TEXT    NOT NULL,
  unit_price      INTEGER NOT NULL CHECK (unit_price > 0),
  quantity        INTEGER NOT NULL CHECK (quantity > 0)
) STRICT;
CREATE INDEX order_items_so ON order_items(seller_order_id);
CREATE INDEX order_items_product ON order_items(product_id);

CREATE TABLE status_history (
  id              INTEGER PRIMARY KEY,
  seller_order_id INTEGER NOT NULL REFERENCES seller_orders(id) ON DELETE RESTRICT,
  from_status     TEXT,
  to_status       TEXT    NOT NULL,
  actor_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role      TEXT    NOT NULL CHECK (actor_role IN ('buyer','seller')),
  created_at      TEXT    NOT NULL
) STRICT;
CREATE INDEX status_history_so ON status_history(seller_order_id, id);

-- DR-7: status history is insert-only.
CREATE TRIGGER status_history_no_update BEFORE UPDATE ON status_history
BEGIN SELECT RAISE(ABORT, 'status_history is insert-only'); END;
CREATE TRIGGER status_history_no_delete BEFORE DELETE ON status_history
BEGIN SELECT RAISE(ABORT, 'status_history is insert-only'); END;

CREATE TABLE reviews (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  buyer_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text       TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  UNIQUE (product_id, buyer_id)
) STRICT;
