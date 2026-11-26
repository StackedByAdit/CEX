<div align="center">

<img width="1572" height="953" alt="ORBIT Exchange — Landing Page" src="./assets/landing.jpg" />

<br /><br />

<img width="1865" height="955" alt="ORBIT Exchange — Trading Interface" src="./assets/trade.jpg" />

<br /><br />

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
User → POST /order (HTTP REST) OR PLACE_ORDER (Zero-Auth WebSocket)
  → auth verified (JWT cookie/bearer or pre-authenticated WS connection)
  → balance locked in-memory (lockAndQueueOrder)
  → LPUSH queue:orders (Redis)
  → HTTP awaits BRPOP result:{orderId} (≤5 s) / WS returns instant ORDER_ACCEPTED

Worker (runWorker)
  → BRPOP queue:orders
  → matchOrder() ← synchronous BTree walk, no DB round-trip
  → balance settled in-memory for buyer + seller
  → fills queued to dbBuffer (500 ms write-behind)
  → LPUSH result:{orderId} / publish order:execution (Redis Pub/Sub)

Redis pub/sub → WebSocket :8080 → browser
  ORDERBOOK_UPDATE  · TRADE  · BALANCE_UPDATE (private)  · CANDLE_UPDATE  · ORDER_EXECUTED
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
    ├── architecture.jpg      # System architecture diagram
    ├── landing.jpg           # Landing page preview
    └── trade.jpg             # Trading interface preview
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
```

Create `backend/.env`:

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
JWT_SECRET="your-secret-key"
REDIS_URL="redis://127.0.0.1:6379"
```

### 3 — Database setup

```bash
cd backend
bun install
bunx prisma migrate deploy
```

Seed initial stocks (if no seed script exists):

```sql
INSERT INTO "Stock" (id, title, symbol, "createdAt")
VALUES (gen_random_uuid(), 'Axis Bank', 'AXIS', now()),
       (gen_random_uuid(), 'HDFC Bank', 'HDFC', now()),
       (gen_random_uuid(), 'Solana',    'SOL',  now());
```

### 4 — Start the backend

```bash
cd backend
bun run index.ts
# HTTP API → http://localhost:3000
# WebSocket → ws://localhost:8080
```

### 5 — Start the frontend

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
```

Open **http://localhost:5173**, sign up, deposit test INR, and start trading.

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

Connect with `?token=<jwt>` or the session cookie.

| Client → Server | Description |
|---|---|
| `{ type: "PLACE_ORDER", requestId, side, orderType, symbol, price?, quantity }` | Instant Zero-Auth order placement |
| `{ type: "SUBSCRIBE_ORDERBOOK", symbol }` | Subscribe; sends snapshot immediately |
| `{ type: "UNSUBSCRIBE_ORDERBOOK", symbol }` | Unsubscribe |
| `{ type: "SUBSCRIBE_CANDLE", symbol, interval }` | Subscribe; sends historical snapshot |
| `{ type: "UNSUBSCRIBE_CANDLE", symbol, interval }` | Unsubscribe |
| `{ type: "GET_BALANCE" }` | Request current balance snapshot |

| Server → Client | Description |
|---|---|
| `ORDER_ACCEPTED` | Immediate ingress confirmation with `orderId` |
| `ORDER_EXECUTED` | Real-time push when order fills or partially fills |
| `ORDERBOOK_SNAPSHOT` | Full book on subscribe |
| `ORDERBOOK_UPDATE` | Book delta after any fill or cancel |
| `TRADE` | Each individual fill event |
| `BALANCE_SNAPSHOT` | Balance state on `GET_BALANCE` |
| `BALANCE_UPDATE` | Private push after any fill or deposit |
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

## Performance & Benchmarks

The exchange is continuously benchmarked using automated multi-stage load test suites evaluating concurrency, throughput, latency percentiles, and ledger integrity across 50 parallel trader accounts.

### Performance Summary

| Metric | Legacy Architecture | New HTTP REST Ingress | Zero-Auth WebSocket Ingress | Gain / Improvement |
|:---|:---:|:---:|:---:|:---:|
| **Peak Throughput** | ~15 – 25 TPS | **203.99 TPS** | **5,998.61 TPS** | **~240x faster** (~30.8x over HTTP) |
| **Median Latency ($p50$)** | 180 – 250 ms | 18.72 – 41.88 ms | **2.17 – 5.85 ms** | **98% latency reduction** |
| **Tail Latency ($p99$)** | 1,200 – 2,500 ms | 43.61 – 75.85 ms | **7.42 – 13.36 ms** | **99% tail latency reduction** |
| **Minimum Latency** | ~95 ms | 6.67 ms | **0.17 ms** | Sub-millisecond response |
| **Order Placement Success** | Contention errors | **100.0%** (1,350/1,350) | **100.0%** (1,350/1,350) | Zero dropped orders |
| **Ledger Accounting Drift** | Prone to lock drift | **Zero Leakage** | **Zero Leakage** | Strict conservation |

### 1. HTTP REST Ingress Benchmark (`POST /order`)

Evaluated with `bot/loadtester.ts` across 50 concurrent accounts:

| Stage Name | Parallel Traders | Total Orders | Duration | Throughput (TPS) | P50 Latency | P90 Latency | P99 Latency | Max Latency |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Warmup & Baseline** | 5 | 100 | 0.59s | **170.20 TPS** | 18.72 ms | 28.93 ms | 43.61 ms | 43.61 ms |
| **Medium Concurrency** | 15 | 250 | 1.23s | **203.99 TPS** | 41.88 ms | 69.50 ms | 75.85 ms | 83.93 ms |
| **High Concurrency** | 30 | 500 | 2.53s | **197.51 TPS** | 82.02 ms | 139.53 ms | 191.47 ms | 208.76 ms |
| **Maximum Burst** | 50 | 500 | 2.57s | **194.66 TPS** | 141.67 ms | 234.52 ms | 275.79 ms | 291.21 ms |

### 2. Zero-Auth WebSocket Ingress Benchmark (`ws://localhost:8080`)

Evaluated with persistent pre-authenticated WebSocket connections:

| Stage Name | Active Connections | Total Orders | Duration | Throughput (TPS) | Ingress P50 | Ingress P90 | Ingress P99 | Max Latency |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **WS Warmup** | 10 | 100 | 0.08s | **1,242.44 TPS** | 3.84 ms | 5.84 ms | 7.49 ms | 7.49 ms |
| **WS Medium Concurrency** | 25 | 250 | 0.09s | **2,751.00 TPS** | 2.17 ms | 5.56 ms | 7.93 ms | 7.94 ms |
| **WS High Concurrency** | 50 | 500 | 0.10s | **4,796.95 TPS** | 4.97 ms | 5.99 ms | 7.42 ms | 7.62 ms |
| **WS Maximum Burst** | 50 | 500 | 0.08s | **5,998.61 TPS** | 5.85 ms | 11.62 ms | 13.36 ms | 13.37 ms |

### 3. Ledger Conservation & Integrity Audit

- **50,330 orders** and **26,218 match fills** audited in the database.
- **₹9,501,031,212,636** total INR and **9,510,291,370 SOL** conserved across all balances.
- **Zero double-spends** and zero negative balances detected.

### Running Load Tests

```bash
# HTTP REST 4-stage load test suite
bun run bot/loadtester.ts

# Automated market maker bot
bun run bot/bot.ts
```

Or launch the in-app **Market Simulator** (`/trade` → Simulator) for a real-time GUI-driven load test with interactive bots.

---

## Design Decisions

| Decision | Why |
|---|---|
| **In-memory BTree orderbook** | O(log n) insert/delete; zero DB latency on the hot path |
| **Redis FIFO queue + BRPOP result** | Decouples HTTP from matching without polling; serial processing without a dedicated process |
| **Write-behind DB buffer** | 500 ms batching reduces DB write pressure; reads flush explicitly for consistency |
| **1 m candles only in DB** | Storage efficiency; coarser intervals aggregated on read in O(n) |
| **Single-process matching** | Node.js event-loop guarantees serial `matchOrder()` execution — no mutex needed |
| **Balance cache seeded at startup** | Eliminates DB round-trips on every order; crash recovery restores open orders from DB |

---

## License

MIT
