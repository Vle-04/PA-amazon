# Shuka — Armenian marketplace

Amazon-style multi-seller marketplace for Armenia: one cart across several sellers, cash on delivery,
integer AMD prices. In production one Node.js process (the backend) serves the REST API and the
built React frontend from one SQLite file (WAL mode).

```
backend/    Express API, SQLite, migrations, seed, backups, tests
frontend/   React app (Vite)
```

## Run locally (one command)

```bash
npm install && npm run dev
```

Open http://localhost:5173. The first run applies migrations and seeds demo data.
The backend runs on :3000 and Vite proxies `/api` and `/uploads` to it. To try it on a phone on
the same Wi-Fi, use the "Network" URL that Vite prints.

`npm install` at the root installs both folders (npm workspaces).

Demo accounts (password `password123`, already email-verified):

| Role | Emails |
|---|---|
| Sellers | `ani@shuka.am`, `gor@shuka.am`, `lilit@shuka.am` |
| Buyers  | `buyer1@shuka.am`, `buyer2@shuka.am` |

Production-like local run: `npm run build && npm start` → http://localhost:3000.

## Email verification

New accounts must confirm their email before they can sign in. Sign-up sends a 6-digit code
(valid 15 minutes, 5 tries) plus a one-click link. Unverified sign-ins are sent back to the
"Check your email" page with a fresh code. Resending is limited to once a minute.

Emails go out over any SMTP provider: copy `backend/.env.example` to `backend/.env` and fill in
`SMTP_*`, `MAIL_FROM` and `APP_URL`. Without `SMTP_HOST`, emails are printed to the backend
console instead, which is handy for local development.

## Scripts

From the root:

| Command | What it does |
|---|---|
| `npm run dev` | migrate, seed if empty, backend (watch) + frontend dev server |
| `npm run build` | build the frontend into `frontend/dist/` |
| `npm start` | migrate, then start the backend (serves `frontend/dist`) |
| `npm run seed` | seed demo data (no-op if already seeded) |
| `npm run test:break-it` | the nine PRD break-it tests against `BASE_URL` (default `http://localhost:3000`) |
| `npm run test:email` | email verification rules |
| `npm run test:fk` | break-it test 8 run directly against the database |

Inside `backend/` there are also `npm run migrate`, `npm run backup` and
`node scripts/seed.js --force` (wipes and reseeds).

The test scripts create verified accounts with `TEST_AUTH_TOKEN` (default `dev-test-token`
locally). Against production, set the same `TEST_AUTH_TOKEN` on the server and in your shell.

## Layout

```
backend/
  src/
    index.js, app.js          server entry and Express app
    config.js                 environment variables
    migrations/               numbered SQL migrations (ten STRICT tables)
    db.js                     connection (WAL, busy_timeout 5000, foreign_keys ON), migrator
    lifecycle.js              order state machine (the server is the only judge)
    routes/                   account, catalog, cart, orders (checkout), seller
    images.js                 content-based check, resize to thumb + large (sharp)
    mail.js                   verification emails (SMTP)
    backup.js                 daily VACUUM INTO, keeps 7
  scripts/                    setup, migrate, seed, backup
  tests/                      break-it, email verification, foreign-key test
  postman/openapi.yaml        API contract
  .env.example                settings template
  data/                       (created at runtime) shuka.db, uploads/, backups/
frontend/
  index.html, vite.config.js
  src/                        React app: App.jsx, pages/, ui.jsx, api.js, styles.css
  public/                     static files (favicon)
```

`DATA_DIR` (default `backend/data`) holds `shuka.db`, `uploads/` and `backups/`. In production
it must be a persistent disk.

## How the hard requirements are met

- **No overselling (DR-5, test 1).** Checkout runs in one `BEGIN IMMEDIATE` transaction. Each line runs
  `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?`. If any line changes 0 rows,
  the whole order rolls back with 409. `CHECK (stock >= 0)` is the last line of defence.
- **Idempotent checkout (DR-6, test 2).** The client sends a `requestKey`. `UNIQUE(buyer_id, request_key)`
  plus a lookup inside the transaction means a repeat returns the existing order.
- **Price changes (test 3).** Cart rows store the price the buyer saw. Checkout refuses with
  `409 PRICE_CHANGED` and lists the new prices. The cart shows the warning until the buyer accepts.
- **Snapshots (DR-2, test 4).** `order_items` copies title and unit price, and `orders` copies the address.
- **Scoping (DR-8, test 5).** Every order query includes `buyer_id = me` or `seller_id = me`. Other
  users' ids return 404.
- **Lifecycle (§5, tests 6–7).** `backend/src/lifecycle.js` holds the transition table. A conditional
  `UPDATE … WHERE status = old` runs, and cancelling returns stock in the same transaction. Every
  move inserts a `status_history` row, and triggers block UPDATE/DELETE on that table.
- **Integrity (DR-1/3/4, test 8).** Money is INTEGER, tables are STRICT, and `foreign_keys = ON`
  is set on every connection. `order_items.product_id` is `ON DELETE RESTRICT`, and products are
  only unpublished.
- **Uploads (NFR-3, test 9).** The limit is 10 MB (multer), and sharp decodes the content, so a
  renamed .exe is rejected. Images are resized to 400px thumbs and 1200px large WebP files. Only
  paths go into the DB, and processing happens before any transaction.

### Decisions on the PRD's open questions

- **Sellers can cancel** Placed/Confirmed orders (as the lifecycle table says). Buyers cancel via
  their own endpoint.
- **Header cart count** = total units.
- **Name/phone are edited** under *Account ▾ → Profile & settings* (`/account`).
- **"Units sold"** counts all non-cancelled orders. Revenue counts only delivered orders.

## Deploy

The root `Dockerfile` builds the frontend and runs the backend. It works on any host with a
persistent disk mounted at `/data` (Fly.io, Railway, Render, or a VPS behind Caddy). Migrations
run automatically on every start.

Environment variables (see `backend/.env.example`):

| Variable | Value |
|---|---|
| `SESSION_SECRET` | long random string, e.g. `openssl rand -hex 32` |
| `APP_URL` | public address, e.g. `https://shuka.fly.dev` (used in email links) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | email provider settings |

### Netlify (frontend) + Render (backend)

- `netlify.toml` builds `frontend/` and writes `_redirects` that proxy `/api` and `/uploads` to
  `BACKEND_URL` (set in Netlify). The browser only talks to the Netlify domain, so the login
  cookie is first-party and no CORS is needed.
- Render runs `backend/` as a Node web service with a persistent disk (paid instance) mounted at
  `/var/data` (`DATA_DIR=/var/data`). Set `APP_URL` to the Netlify address and `TRUST_PROXY=2`.
- Run the break-it tests directly against the Render address (`BASE_URL=https://<api>.onrender.com`).

### Fly.io

```bash
fly auth login
fly launch --no-deploy --copy-config --name <your-unique-app-name>   # keeps fly.toml
fly volumes create shuka_data --size 1 --region fra
fly secrets set SESSION_SECRET=$(openssl rand -hex 32) APP_URL=https://<app>.fly.dev \
  SMTP_HOST=... SMTP_PORT=465 SMTP_USER=... SMTP_PASS=... MAIL_FROM="Shuka <...>"
fly deploy
fly ssh console -C "node /app/backend/scripts/seed.js"     # once, for demo data
```

- The server writes `/data/backups/shuka-YYYY-MM-DD.db` daily and keeps 7. Fly also snapshots
  the volume daily. To pull a copy: `fly ssh sftp get /data/backups/shuka-<date>.db`.
- Verify the live build: temporarily `fly secrets set TEST_AUTH_TOKEN=<random>`, run
  `TEST_AUTH_TOKEN=<random> BASE_URL=https://<app>.fly.dev npm run test:break-it`, then
  `fly secrets unset TEST_AUTH_TOKEN`. For test 8 run
  `fly ssh console -C "node /app/backend/tests/fk-test.mjs"`.
