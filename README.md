<div align="center">

<img src="./frontend/public/orbit.svg" width="64" alt="ORBIT logo" />

# ORBIT Exchange

**A centralized exchange built on an in-memory matching engine.**  
Limit & market orders · Real-time order book · Candlestick charts · WebSocket push · Market simulator

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.x-fbf0df?logo=bun&logoColor=black)](https://bun.sh/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-336791?logo=postgresql&logoColor=white)](https://www.prisma.io/)

</div>

---

## Overview

ORBIT Exchange is a full-stack, production-patterned centralized exchange. It demonstrates the core internals of a matching engine — order queuing, BTree-based price-time priority matching, in-memory balance ledgering, write-behind persistence, and live market data delivery via WebSocket.

It is **not** connected to real money. All balances are test credits.

---

## Architecture

![ORBIT Exchange — System Architecture & Data Flow](./assets/architecture.jpg)

The system is split into five layers that compose the complete trade lifecycle:

| Layer | Technology | Role |
|---|---|---|
| **Frontend** | React 19 + Vite + TypeScript | Trading UI, candlestick charts, order form, market simulator |
| **HTTP API** | Express 5 on Bun (`:3000`) | Auth, order admission, balance pre-check, REST endpoints |
| **Message Bus** | Redis (ioredis, 5 clients) | Order queue, request-result bridge, pub/sub event fan-out |
| **Matching Engine** | In-process BTree (`:3000`) | Price-time priority matching, in-memory balance settlement |
| **Persistence** | PostgreSQL via Prisma 7 | Write-behind buffer, order/fill/balance/candle storage |

### How an order flows

```
User → POST /order
  → authMiddleware (JWT)
  → balance locked in-memory
  → LPUSH queue:orders (Redis)
  → BRPOP result:{orderId} ← HTTP request blocks here (≤5 s)

Worker (runWorker)
  → BRPOP queue:orders
  → matchOrder() ← synchronous BTree walk, no DB round-trip
  → balance settled in-memory for buyer + seller
  → fills queued to dbBuffer
  → LPUSH result:{orderId} ← HTTP request unblocks

Redis pub/sub → WebSocket :8080 → browser
  ORDERBOOK_UPDATE  · TRADE  · BALANCE_UPDATE (private)  · CANDLE_UPDATE
```

Key design choices:

- **Matching is synchronous.** Node.js is single-threaded, so `matchOrder()` runs to completion before any other JavaScript. No mutex, no race condition.
- **Writes are deferred.** A 500 ms debounced buffer batches orders, fills, and balances into a single Prisma `$transaction`. Reads that need DB consistency call `flushDbBuffer()` explicitly before querying.
- **Only 1 m candles are stored.** All other intervals (15 m, 1 h, 4 h, 1 d) are aggregated on read from the 1 m rows. The live unsaved candle lives in memory.
- **Five Redis clients.** ioredis does not allow pub/sub and commands on the same connection — dedicated clients for queue, result, worker, subscriber, and publisher.

---

## Repository Layout

```
cex/
├── backend/                  # Bun + Express API + matching engine
│   ├── src/
│   │   ├── index.ts          # HTTP routes + bootstrap
│   │   ├── worker.ts         # Redis queue consumer
│   │   ├── ws.ts             # WebSocket server + pub/sub fan-out
│   │   ├── state.ts          # Shared in-memory singletons
│   │   ├── redis.ts          # Five ioredis client instances
│   │   └── utils/
│   │       ├── matchOrder.ts # BTree matching engine
│   │       ├── dbBuffer.ts   # Write-behind persistence buffer
│   │       ├── candle.ts     # OHLCV candle engine
│   │       ├── publish.ts    # Redis pub/sub helpers
│   │       ├── orderSync.ts  # Crash-recovery order restoration
│   │       ├── assureBalance.ts
│   │       ├── marketOrder.ts
│   │       └── ticker.ts
│   └── prisma/schema.prisma
│
├── frontend/                 # React 19 + Vite trading UI
│   └── src/
│       ├── pages/TradePage.tsx      # State hub
│       ├── components/trading/      # OrderBook, KLineChart, OrderForm, OrdersPanel
│       ├── lib/ws.ts                # OrbitWebSocket singleton
│       ├── lib/api.ts               # All REST calls
│       └── lib/simulator/           # In-browser market simulator (bot engine)
│
├── bot/                      # CLI load-testing bot (Bun + axios)
│   ├── bot.ts
│   └── loadtester.ts
│
└── assets/
    └── architecture.jpg      # System architecture diagram
```

---

## Features

### Trading
- **Limit orders** — rests on the book at a specified price; cancellable
- **Market orders** — fills immediately against resting liquidity; unfilled remainder is cancelled, over-locked quote is refunded
- **Order book** — live BTree snapshot + WebSocket delta updates, depth bars, spread display
- **Candlestick chart** — powered by klinecharts; intervals: 1 m, 15 m, 1 h, 4 h, 1 d; live ticking via WS
- **Ticker bar** — last price, 24 h change %, high, low, volume (computed from DB fills)
- **Order history & trade history** — personal fills with side annotation
- **Wallet** — available & locked balances per asset, deposit flow

### Market Simulator
An in-browser bot engine that provisions real exchange accounts and places real orders:
- Configurable bot count (1–50), speed (slow / normal / fast), aggression (passive / mixed / aggressive)
- Liquidity-aware: switches to market-making when the opposite side is empty
- Live TPS chart, per-bot activity log, error tracking

### Infrastructure
- JWT authentication via HTTP-only session cookie or `Authorization: Bearer` header
- Crash recovery: open limit orders are restored into the in-memory book on startup
- WebSocket heartbeat (30 s ping/pong) with auto-reconnect on the client
- Write-behind DB buffer with retry-on-failure and deduplication

---

## Supported Assets

| Symbol | Name |
|---|---|
| `AXIS` | Axis Bank |
| `HDFC` | HDFC Bank |
| `SOL` | Solana |

Base currency: `INR`

---

## Getting Started

### Prerequisites

| Requirement | Version |
|---|---|
| [Bun](https://bun.sh/) | ≥ 1.1 |
| [Node.js](https://nodejs.org/) | ≥ 20 (frontend only) |
| [Redis](https://redis.io/) | ≥ 7 |
| [PostgreSQL](https://www.postgresql.org/) | ≥ 15 |

### 1 — Clone

```bash
git clone https://github.com/StackedByAdit/CEX.git
cd CEX
```

### 2 — Configure the backend

```bash
cd backend
cp .env.example .env   # create your own if .env.example is absent
```

Set the following variables in `backend/.env`:

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
JWT_SECRET="your-secret-key"
REDIS_URL="redis://127.0.0.1:6379"
```

### 3 — Database setup

```bash
cd backend
bun install
bunx prisma migrate deploy   # run migrations
bunx prisma db seed          # seed initial stocks (AXIS, HDFC, SOL)
```

> If you don't have a seed file yet, insert rows manually:
> ```sql
> INSERT INTO "Stock" (id, title, symbol, "createdAt")
> VALUES (gen_random_uuid(), 'Axis Bank', 'AXIS', now()),
>        (gen_random_uuid(), 'HDFC Bank', 'HDFC', now()),
>        (gen_random_uuid(), 'Solana',    'SOL',  now());
> ```

### 4 — Start the backend

```bash
cd backend
bun run index.ts
# HTTP API on :3000
# WebSocket server on :8080
```

### 5 — Start the frontend

```bash
cd frontend
npm install
npm run dev
# Development server on http://localhost:5173
# API + WS proxied to localhost:3000 / :8080 via vite.config.ts
```

Open **http://localhost:5173**, sign up for an account, deposit some test INR, and start trading.

---

## API Reference

All authenticated endpoints require a valid JWT in the `session` cookie **or** `Authorization: Bearer <token>` header.

| Method | Path | Auth | Description |
|---|---|:---:|---|
| `POST` | `/signup` | — | Register user |
| `POST` | `/login` | — | Authenticate; sets session cookie + returns token |
| `POST` | `/logout` | — | Clear session cookie |
| `POST` | `/deposit` | ✓ | Add INR or stock balance |
| `POST` | `/order` | ✓ | Place LIMIT or MARKET order |
| `DELETE` | `/order/:id` | ✓ | Cancel an open LIMIT order |
| `GET` | `/orders` | ✓ | List orders (`?status=PENDING\|FILLED\|…`) |
| `GET` | `/orderbook/:symbol` | ✓ | In-memory book snapshot |
| `GET` | `/balance` | ✓ | Current balances |
| `GET` | `/ticker/:symbol` | ✓ | 24 h price stats |
| `GET` | `/trades/:symbol` | ✓ | Last 50 fills for a symbol |
| `GET` | `/trades/personal` | ✓ | Authenticated user's fills |
| `GET` | `/stocks` | ✓ | All listed stocks |
| `GET` | `/candles/:symbol/:interval` | ✓ | OHLCV snapshot (`1m` `15m` `1h` `4h` `1d`) |

### WebSocket — `ws://localhost:8080`

Connect with `?token=<jwt>` or the session cookie. Send JSON messages:

| Client → Server | Description |
|---|---|
| `{ type: "SUBSCRIBE_ORDERBOOK", symbol }` | Subscribe to live book updates; sends snapshot immediately |
| `{ type: "UNSUBSCRIBE_ORDERBOOK", symbol }` | Unsubscribe |
| `{ type: "SUBSCRIBE_CANDLE", symbol, interval }` | Subscribe to 1 m candle updates; sends historical snapshot |
| `{ type: "UNSUBSCRIBE_CANDLE", symbol, interval }` | Unsubscribe |
| `{ type: "GET_BALANCE" }` | Request current balance snapshot |

| Server → Client | Description |
|---|---|
| `ORDERBOOK_SNAPSHOT` | Full book on subscribe |
| `ORDERBOOK_UPDATE` | Book delta after any fill or cancel |
| `TRADE` | Each individual fill |
| `BALANCE_SNAPSHOT` | Balance state on `GET_BALANCE` |
| `BALANCE_UPDATE` | Private push after any fill or deposit touching this user |
| `CANDLE_SNAPSHOT` | Historical candles on subscribe |
| `CANDLE_UPDATE` | Live 1 m candle push after every trade |

---

## Database Schema

```
User ──< Order ──< Fill >── Order
 │                            │
 └──< Balance              Stock ──< Fill
                                └──< Order
                                └──< Balance
                                └──< Candle (1m only)
```

| Model | Key columns |
|---|---|
| `User` | `id`, `username`, `password` (bcrypt) |
| `Stock` | `id`, `symbol` (unique), `title` |
| `Order` | `side`, `type`, `status`, `price?`, `quantity`, `filledQuantity` |
| `Fill` | `buyOrderId`, `sellOrderId`, `price`, `quantity` |
| `Balance` | `userId`, `assetType` (INR / STOCK), `available`, `locked` |
| `Candle` | `symbol`, `interval` (always `"1m"`), OHLCV, `startTime` (unique) |

---

## Load Testing

A minimal CLI bot is included in `bot/`:

```bash
cd bot
bun install      # if needed
bun run bot.ts   # 2 bots, 10 orders/second
```

Or use the in-app **Market Simulator** (Navbar → Simulator) for a GUI-driven load test without leaving the browser.

---

## Project Structure Decisions

| Decision | Why |
|---|---|
| **In-memory BTree orderbook** | O(log n) insert/delete; zero DB latency on the hot path |
| **Redis FIFO queue + BRPOP result** | Decouples HTTP from matching without polling; serial order processing without a dedicated process |
| **Write-behind DB buffer** | 500 ms batching dramatically reduces DB write pressure while keeping reads consistent via explicit flush |
| **1 m candles only in DB** | Storage efficiency; coarser intervals aggregated on read in O(n) |
| **Single-process matching** | Node.js event-loop guarantees serial execution of `matchOrder()` — no mutex needed |
| **Balance cache seeded at startup** | Eliminates DB round-trips on every order; crash recovery restores open orders from DB |

---

## License

MIT
