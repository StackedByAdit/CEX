# ORBIT Exchange — Backend

Bun + Express HTTP API, in-memory matching engine, Redis queue, and WebSocket server for the ORBIT Exchange.

---

## Stack

| | |
|---|---|
| **Runtime** | [Bun](https://bun.sh/) ≥ 1.1 |
| **HTTP framework** | Express 5 |
| **WebSocket** | `ws` library |
| **Message broker** | Redis via ioredis (5 separate clients) |
| **ORM** | Prisma 7 |
| **Database** | PostgreSQL |
| **Auth** | JWT (jsonwebtoken) + bcrypt |
| **Validation** | Zod 4 |
| **Orderbook** | sorted-btree |

---

## Setup

### 1 — Install dependencies

```bash
bun install
```

### 2 — Environment variables

Create a `.env` file in this directory:

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
JWT_SECRET="your-long-random-secret"
REDIS_URL="redis://127.0.0.1:6379"
```

### 3 — Run database migrations

```bash
bunx prisma migrate deploy
```

### 4 — Seed stocks

The exchange needs at least one stock row before any order can be placed. Insert rows manually or write a seed script:

```sql
INSERT INTO "Stock" (id, title, symbol, "createdAt")
VALUES (gen_random_uuid(), 'Axis Bank', 'AXIS', now()),
       (gen_random_uuid(), 'HDFC Bank', 'HDFC', now()),
       (gen_random_uuid(), 'Solana',    'SOL',  now());
```

### 5 — Start the server

```bash
bun run index.ts
```

- HTTP API → `http://localhost:3000`
- WebSocket → `ws://localhost:8080`

---

## How It Works

### Bootstrap sequence

On startup, `bootstrap()` in `index.ts`:

1. Loads all `Stock` rows → populates `STOCK_BY_SYMBOL` cache
2. Loads all `Balance` rows → seeds the `BALANCES` in-memory map
3. Calls `restoreOpenOrders()` → rehydrates all `PENDING` / `PARTIALLY_FILLED` limit orders into the `ORDERBOOK` BTree (crash recovery)
4. Starts the WebSocket server on `:8080`
5. Starts `runWorker()` — the Redis queue consumer
6. Starts a 5 s interval for `advanceCandlesIfNeeded()`
7. Starts Express on `:3000`

### In-memory state (`state.ts`)

| Singleton | Type | Description |
|---|---|---|
| `ORDERBOOK` | `Record<symbol, { bids: BTree, asks: BTree }>` | Price-sorted BTree per symbol. Asks ascending, bids descending. |
| `BALANCES` | `Record<userId, Record<symbol, { available, locked, balanceId }>>` | Live balance cache. Source of truth for the hot path. |
| `CANDLES` | `Record<"symbol:1m", OHLCVCandle>` | Active unsaved 1 m candle per symbol. |
| `STOCK_BY_SYMBOL` | `Record<symbol, { id }>` | DB `stockId` lookup by symbol. |
| `ORDERS` | `MemoryOrder[]` | All orders placed since startup. |

### Order lifecycle

```
POST /order
  1. JWT auth
  2. Zod validation
  3. Balance pre-lock in BALANCES (in-memory, immediate)
  4. LPUSH queue:orders → Redis
  5. BRPOP result:{orderId} → request blocks (≤ 5 s timeout)

runWorker() [separate async loop]
  6. BRPOP queue:orders
  7. matchOrder() — synchronous BTree walk
     - BUY:  walk asks ascending; stop when ask > limit price
     - SELL: walk bids descending; stop when bid < limit price
     - Mutates BALANCES for buyer + all matched sellers
     - Unfilled LIMIT remainder inserted back into BTree
     - MARKET unfilled quantity refunded from locked balance
  8. persistMatchResult() → queues to dbBuffer
  9. publishMatchEvents() → Redis pub/sub
 10. LPUSH result:{orderId} → request unblocks

dbBuffer [500 ms debounce]
 11. Prisma $transaction { order upsert, fill createMany, balance update }
```

### Candle engine (`utils/candle.ts`)

- Only `1m` candles are written to the `Candle` table.
- `processTradesBatch()` updates `CANDLES["symbol:1m"]` OHLCV after every match.
- `advanceCandlesIfNeeded()` runs every 5 s: if the live candle is stale, it persists the old bucket and opens a new one.
- `getCandleSnapshot()` serves any interval by fetching 1 m rows from DB and aggregating them with `aggregate1m()`.
- Live clients receive `CANDLE_UPDATE` (1 m) and aggregate client-side into their selected interval.

### Redis clients

Five separate ioredis instances (pub/sub and blocking commands cannot share a connection):

| Client | Usage |
|---|---|
| `redisClient` | LPUSH to `queue:orders`; LPUSH to `result:{id}` |
| `resultClient` | BRPOP `result:{orderId}` in HTTP handler |
| `workerClient` | BRPOP `queue:orders` in `runWorker()` |
| `subscriber` | Subscribes to all market and balance channels |
| `publisher` | Publishes to those channels after order events |

### Write-behind buffer (`utils/dbBuffer.ts`)

Three in-memory queues:

- `orderBuffer` — `Map<orderId, {order, stockId}>` deduped by ID
- `fillBuffer` — `FillRecord[]` always appended
- `balanceBuffer` — `Map<balanceId, {available, locked}>` deduped by balance ID

A 500 ms debounce timer flushes all three in a single `$transaction`. Routes that read from DB call `await flushDbBuffer()` first to ensure consistency. On transaction failure, work is re-queued with newer state winning deduplication.

---

## Project Structure

```
backend/
├── src/
│   ├── index.ts                  # Routes + bootstrap
│   ├── worker.ts                 # Order processor
│   ├── ws.ts                     # WebSocket server
│   ├── state.ts                  # In-memory singletons
│   ├── redis.ts                  # ioredis client exports
│   ├── prisma.ts                 # Prisma client singleton
│   ├── middleware/
│   │   └── authMiddleware.ts     # JWT verify
│   ├── schemas/
│   │   └── zodSchema.ts          # Request validation
│   ├── types/
│   │   └── order.ts              # MemoryOrder type
│   └── utils/
│       ├── matchOrder.ts         # Matching engine
│       ├── dbBuffer.ts           # Write-behind buffer
│       ├── candle.ts             # OHLCV engine
│       ├── publish.ts            # pub/sub helpers
│       ├── orderSync.ts          # Crash recovery
│       ├── assureBalance.ts      # Balance cache management
│       ├── marketOrder.ts        # Market order estimation
│       ├── ticker.ts             # 24 h stats
│       └── sessionCookie.ts      # Token extraction
├── prisma/
│   └── schema.prisma
├── generated/
│   └── prisma/                   # Generated Prisma client
└── package.json
```

---

## Scripts

| Command | Description |
|---|---|
| `bun run index.ts` | Start the server |
| `bunx prisma migrate dev` | Create and apply a new migration |
| `bunx prisma migrate deploy` | Apply migrations in production |
| `bunx prisma studio` | Open Prisma Studio |
| `bun test` | Run unit tests (`*.test.ts`) |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✓ | PostgreSQL connection string |
| `JWT_SECRET` | ✓ | Secret for signing/verifying JWTs |
| `REDIS_URL` | — | Redis URL (default: `redis://127.0.0.1:6379`) |
