# Pub Management System

A pub / bar / club management platform: fast POS service, end-to-end money and
stock traceability, profitability and top/least-seller analytics, and an
automated engine that recommends what stock to **increase, reduce, promote or
discontinue**.

The repository contains a **complete, tested backend** (REST API,
PostgreSQL/Prisma, RBAC, costing & decision engines, seed data, Docker) **and a
React + Vite frontend** covering the POS, floor, inventory, purchasing, menu,
customers, shifts, reports and settings. See
[Status](#status--what-is-and-isnt-built) for the exact line between finished
and scaffolded.

---

## Overview & assumptions

A few professional decisions were made where the brief left room:

- **Express + TypeScript** (not NestJS). The brief allowed either; hand-authored
  Express is leaner and there's no framework magic between you and the logic.
- **Prisma `Decimal` + `decimal.js` everywhere for money and quantities.** No
  floats touch a price, a pour, or a variance.
- **One stock ledger.** `current_stock` only ever moves through an immutable
  `stock_movements` row, so the running balance and the audit trail can't drift.
  SIMPLE products carry a 1:1 recipe to their own stock item, so *every* sale
  deducts stock through the same recipe path — no special cases.
- **Tax is added on top** of tax-exclusive menu prices; a sale-level discount is
  apportioned across the taxable base before tax.
- **Realtime, PDF/Excel export and payment/printer hardware** are
  built as clean seams (`lib/events.ts`, `lib/hardware.ts`) with working stubs,
  not faked as complete. See [Status](#status--what-is-and-isnt-built).

## Architecture

```
pub_system/
├─ docker-compose.yml          # Postgres + API
├─ backend/
│  ├─ prisma/
│  │  ├─ schema.prisma         # full data model (26 tables)
│  │  ├─ migrations/           # initial migration SQL
│  │  └─ seed.ts               # demo pub: roles, users, menu, 3 weeks of sales
│  └─ src/
│     ├─ config/               # env + the RBAC permission/role catalog
│     ├─ domain/               # PURE engines (no DB) + their unit tests
│     │  ├─ costing.ts         #   costing, margins, P&L, reorder math
│     │  └─ recommendations.ts #   ABC analysis + stock-decision rules
│     ├─ lib/                  # prisma, audit, stock ledger, tokens, events, hardware
│     ├─ middleware/           # auth (JWT), rbac, errors
│     └─ modules/              # one router per area (auth, sales, inventory, …)
└─ frontend/
   ├─ Dockerfile / nginx.conf  # build the SPA, reverse-proxy /api + /socket.io
   └─ src/
      ├─ components/           # UI primitives, app shell, page scaffolding
      ├─ store/                # auth + POS cart (zustand)
      ├─ lib/                  # api client (+ token refresh), socket, formatting
      └─ pages/                # Login, Dashboard, POS, Tables, Inventory, …
```

The two files under `domain/` are the heart of the system and are deliberately
database-free so they can be reasoned about and tested in isolation.

## Getting started

### Option A — Docker (everything)

```bash
docker compose up --build
```

This starts Postgres, applies migrations, **seeds demo data**, serves the API at
<http://localhost:4000>, and serves the **web app at <http://localhost:8080>**
(nginx reverse-proxies `/api` and the Socket.IO upgrade, so the browser talks to
one origin). API health check: <http://localhost:4000/api/health>.

### Option B — Local, two terminals

```bash
# 1) Backend  (needs a Postgres on localhost:5432 — or `docker compose up db`)
cd backend
cp .env.example .env          # adjust DATABASE_URL if needed
npm install
npm run prisma:generate
npm run prisma:deploy         # apply migrations
npm run seed                  # load demo data
npm run dev                   # http://localhost:4000

# 2) Frontend  (Vite dev server proxies /api → :4000)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

### Demo logins

Every role has two users: `<role>1` and `<role>2`. Password `password123`,
POS PIN `1234`.

| Username | Role | Lands on |
|---|---|---|
| `owner1` | Owner | Dashboard |
| `manager1` | Manager | Dashboard |
| `bartender1` | Bartender | POS |
| `cashier1` | Cashier | POS |
| `storekeeper1` | Storekeeper | Inventory |
| `accountant1` | Accountant | Reports |
| `systemadmin1` | System Admin | Settings |

```bash
# Grab a token:
curl -s localhost:4000/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"owner1","password":"password123"}'
```

## Testing

```bash
cd backend
npm test          # 23 unit tests over the costing + decision engines
npm run typecheck # strict tsc over the whole codebase
```

The engine tests need no database — they lock down the formulas and the
increase/reduce/discontinue rules directly.

## Key formulas (implemented in `domain/costing.ts`)

```
cost_per_drink        = Σ(ingredient qty × stock cost_price)
gross_profit          = selling_price − cost
gross_margin_%        = (gross_profit ÷ selling_price) × 100
pour_cost_%           = (cost ÷ selling_price) × 100
net_profit            = gross_profit − operating_expenses
inventory_turnover    = COGS ÷ average_inventory
reorder_point         = (avg_daily_usage × lead_time_days) + safety_stock
suggested_order_qty   = par − current − on_order + expected_usage_before_delivery
stock_variance        = theoretical_usage − actual_usage
```

## Stock decision engine (`domain/recommendations.ts`)

Runs ABC (Pareto) classification, then applies the rule table:

| Situation | Action emitted |
|---|---|
| Class-A seller at/below reorder point | `URGENT_REORDER` (+ suggested qty) |
| Class-A + high margin | `INCREASE_AND_PROMOTE` |
| Slow (Class-C) + high days-of-cover | `REDUCE_ORDERS` |
| No sales ≥ 60d, still profitable | `PROMOTE_OR_BUNDLE` |
| No sales ≥ 90d + low margin | `DISCONTINUE` |
| Usage variance over threshold | `INVESTIGATE_VARIANCE` |
| Batch near expiry | `USE_FIRST_NEAR_EXPIRY` |
| Selling volume, thin margin | `REVIEW_PRICE_OR_SUPPLIER` |

Served live at `GET /api/dashboard/recommendations` (built from real movement,
sales, PO and expiry data).

## API surface

All routes are under `/api`, all mutations enforce a permission and write an
`audit_logs` row.

- **Auth** — `POST /auth/login`, `/auth/pin-login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`
- **POS** — `POST /sales`, `POST /sales/:id/pay`, `POST /sales/:id/void`, `GET /sales`
- **Floor** — `GET/POST /tables`, `GET/POST/PATCH /tabs`
- **Inventory** — `/stock-items`, `/stock-items/:id/adjust`, `/stock-movements`, `/wastage`, `/stock-counts`, `/stock-counts/:id/complete`
- **Menu** — `/products`, `/product-categories`, `PUT /products/:id/recipe`
- **Purchasing** — `/suppliers`, `/purchase-orders`, `/goods-received`
- **Shifts & cash** — `/shifts`, `POST /shifts/:id/close`, `/shifts/:id/z-report`, `/cash-movements`
- **Customers** — `/customers`, `POST /customers/:id/redeem`
- **Expenses** — `/expenses`
- **Reports** — `/reports/sales`, `/reports/top-drinks`, `/reports/bottom-drinks`, `/reports/profitability`, `/reports/stock`, `/reports/stock-variance`, `/reports/cash-variance`, `/reports/tax`
- **Dashboard** — `/dashboard/kpis`, `/dashboard/alerts`, `/dashboard/recommendations`
- **Admin** — `/users`, `/roles`, `/permissions`, `PUT /roles/:id/permissions`, `/audit-logs`

See [`backend/api.http`](backend/api.http) for a ready-to-run request collection.

## Offline POS

The till keeps selling when the API is unreachable:

- The menu and open tabs are cached from their last successful load.
- A sale that gets no response (or a 502/503/504 from the proxy) goes into an
  IndexedDB outbox. It is replayed on reconnect and on a 20s heartbeat.
- Every sale carries a till-minted `clientRef`, unique in `sales`. A replay whose
  first response was lost returns the stored sale (`replayed: true`). It does
  not create a second sale, and stock is not deducted twice.
- `soldAt` keeps the real time of sale. The sale, its stock movements and its
  payments are all backdated, and the sale is booked to the shift that was open
  at that moment. Times over 2 minutes in the future or more than 72h old are
  rejected (`domain/offlineSync.ts`).
- Charging an order creates the sale and its payment in **one** transaction, so
  an unpaid order is never left behind.
- Only the bartender who rang up a queued sale can replay it. Sales the server
  rejects (e.g. the tab was closed meanwhile) are listed in the status bar, where
  they can be retried or discarded.

## Status — what is and isn't built

| Area | Status |
|---|---|
| Data model (26 tables, migration) | ✅ Complete |
| Auth, JWT refresh, granular RBAC | ✅ Complete |
| POS: tabs → sales → stock deduction → split payment → void reversal | ✅ Complete |
| Inventory: ledger, adjust, wastage, counts + variance | ✅ Complete |
| Purchasing: suppliers, POs, goods-received | ✅ Complete |
| Shifts, cash movements, X/Z reports, variance | ✅ Complete |
| Costing + P&L + ABC + decision engine (unit-tested) | ✅ Complete |
| Reports & dashboard endpoints | ✅ Complete |
| Immutable audit trail on every mutation | ✅ Complete |
| Seed: demo pub with 3 weeks of sales | ✅ Complete |
| **Frontend** — Login, Dashboard, POS, Tables, Inventory, Purchasing, Menu, Customers, Shifts, Reports, Settings | ✅ Complete, role-aware, responsive |
| Realtime (Socket.IO) | ✅ API publishes; app shows live connection + reacts to order events |
| Reports export | ✅ CSV + browser Print/PDF; server-side PDF/Excel ⏳ |
| Hardware (printer, terminal, flow meter, scale) | ⚙️ Interfaces + mocks |
| Offline POS sync | ✅ IndexedDB outbox, idempotent replay (`clientRef`), original sale time kept |
| Multi-branch | ⏳ Designed-for, not yet built |

## License

Provided as a project scaffold for the requested build. No warranty.
