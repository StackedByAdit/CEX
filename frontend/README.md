# ORBIT Exchange — Frontend

React 19 + Vite trading interface for the ORBIT Exchange backend.

---

## Stack

| | |
|---|---|
| **Framework** | React 19 |
| **Build tool** | Vite 6 |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 4 |
| **Charts** | klinecharts |
| **Routing** | React Router 7 |

---

## Prerequisites

- Backend running on `http://localhost:3000`
- WebSocket server on `ws://localhost:8080`

---

## Setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

During development, Vite proxies all API requests (`/login`, `/order`, etc.) and the WebSocket connection to the backend — no CORS configuration needed.

---

## Pages

| Route | Access | Description |
|---|---|---|
| `/` | Public | Landing page with feature overview and market simulator teaser |
| `/login` | Guest only | Sign in with username + password |
| `/signup` | Guest only | Create account (receives zero balances; use `/deposit` to fund) |
| `/trade` | Auth required | Main exchange UI |

Route guards redirect automatically — unauthenticated users hitting `/trade` go to `/login`; authenticated users hitting `/login` go to `/trade`.

---

## Trading UI (`/trade`)

The `TradePage` component is the state hub for the entire exchange. It manages:

- Live order book (`bids`, `asks`) — initial REST snapshot + WebSocket deltas
- Candlestick chart data — initial HTTP fetch + WebSocket 1 m ticks
- Ticker stats (`lastPrice`, `change24h`, `high24h`, `low24h`, `volume24h`)
- User balances (`INR`, per-stock)
- Open orders and personal trade history

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Navbar (tabs: Spot / Wallet / History / Simulator toggle)      │
├────────────┬────────────────────────────────────────┬───────────┤
│            │  TickerBar (symbol selector + stats)   │           │
│  Sidebar   ├──────────────────────┬─────────────────┤ OrderForm │
│  (nav +    │  KLineChart          │                 │           │
│  balances) │  (klinecharts)       │  OrderBook      │ (Buy/Sell │
│            │                      │  (depth bars)   │  Limit /  │
│            ├──────────────────────┴─────────────────┤  Market)  │
│            │  OrdersPanel (open orders + trades)    │           │
└────────────┴────────────────────────────────────────┴───────────┘
│  Footer (UTC clock + links)                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| Component | File | Description |
|---|---|---|
| `KLineChart` | `trading/KLineChart.tsx` | Candlestick chart with 1 m / 15 m / 1 h / 4 h / 1 d periods. Uses klinecharts `DataLoader` for history and a WS handler for live ticks. Client-side aggregates 1 m updates into the active period bucket. |
| `OrderBook` | `trading/OrderBook.tsx` | 12-level asks + 12-level bids with depth-bar visualisation. Spread and spread % computed live. |
| `OrderForm` | `trading/OrderForm.tsx` | BUY / SELL toggle, LIMIT / MARKET toggle. Market orders show a client-side estimated cost from the current orderbook. 25 / 50 / 75 / 100 % quick-fill buttons. |
| `TickerBar` | `trading/TickerBar.tsx` | Symbol selector + 24 h stats. |
| `OrdersPanel` | `trading/OrdersPanel.tsx` | Open orders with cancel action; personal trade history tab. |
| `WalletView` | `wallet/WalletView.tsx` | Balance table with deposit form. |
| `HistoryView` | `history/HistoryView.tsx` | Full order history and all personal fills. |
| `MarketSimulatorView` | `simulator/MarketSimulatorView.tsx` | Full-screen simulator dashboard. |

---

## WebSocket Client (`lib/ws.ts`)

The singleton `orbitWs` (instance of `OrbitWebSocket`) manages the connection lifecycle:

- Connects automatically when `TradePage` mounts
- Sends `GET_BALANCE` + resubscribes to the current symbol on every (re)connect
- Auto-reconnects after 2 s on disconnect
- Tracks the current `orderbookSymbol` and `candleSymbol` for reconnect resubscription
- All components subscribe via `orbitWs.subscribe(handler)` — returns an unsubscribe function

Incoming message types handled in `TradePage`:

| Message | Action |
|---|---|
| `ORDERBOOK_SNAPSHOT` / `ORDERBOOK_UPDATE` | `setBids` / `setAsks` → re-renders OrderBook |
| `TRADE` | Updates `lastPrice`; debounced refresh of orders + ticker |
| `BALANCE_SNAPSHOT` / `BALANCE_UPDATE` | `setBalances` → live available/locked display |
| `CANDLE_UPDATE` | Forwarded to `KLineChart` for period-bucket aggregation |

---

## Market Simulator (`lib/simulator/`)

An in-browser bot trading engine that uses real exchange accounts and the live API.

```
useSimulator() hook
  └── SimulatorService (singleton, useSyncExternalStore)
        └── MarketSimulator
              └── SimBot × N
                    1. Login (or signup on first run)
                    2. Deposit INR + target stock
                    3. Fetch orderbook for best bid/ask
                    4. Decide: passive LIMIT or crossing MARKET (based on aggression)
                    5. POST /order with Bearer token
                    6. Schedule next tick (intervalMs ± 40% jitter)
```

Configuration:
- **Bot count**: 1–50 concurrent bots
- **Speed**: slow (3 s) / normal (1.5 s) / fast (0.5 s) per-bot interval
- **Aggression**: passive (5% crossing) / mixed (30%) / aggressive (70%)

Bots are liquidity-aware: if a market buy would fail due to no asks, the bot places a sell limit instead to replenish the book.

---

## API Client (`lib/api.ts`)

All REST calls use `fetch` with `credentials: "include"` (sends the session cookie automatically). A shared `request<T>()` helper handles JSON serialisation, status checking, and `401 → clearAuth()` side-effects.

Key functions: `signup`, `login`, `logout`, `depositFunds`, `fetchStocks`, `fetchBalances`, `fetchOrderbook`, `fetchOrders`, `fetchTrades`, `fetchPersonalTrades`, `fetchTicker`, `fetchCandles`, `placeOrder`, `cancelOrder`.

---

## Build

```bash
npm run build     # outputs to dist/
npm run preview   # preview the production build locally
```

---

## Environment Variables

Create `frontend/.env` (optional — defaults work for local development):

```env
VITE_WS_URL=ws://localhost:8080
```

If `VITE_WS_URL` is not set, the client constructs the WebSocket URL from `window.location.host` with `ws://` or `wss://` based on the page protocol — suitable for reverse-proxy deployments.

---

## Project Structure

```
frontend/src/
├── App.tsx                         # Route layout + auth guards
├── main.tsx                        # React root
├── index.css                       # Global styles + Tailwind
├── pages/
│   ├── LandingPage.tsx
│   ├── LoginPage.tsx
│   ├── SignupPage.tsx
│   └── TradePage.tsx               # Main state hub
├── components/
│   ├── trading/                    # KLineChart, OrderBook, OrderForm, OrdersPanel, TickerBar
│   ├── layout/                     # Navbar, Sidebar, Footer
│   ├── wallet/                     # WalletView
│   ├── history/                    # HistoryView
│   ├── simulator/                  # MarketSimulatorView, SimulatorDropdown
│   ├── auth/                       # AuthLayout
│   ├── brand/                      # BrandMark
│   ├── common/                     # AssetDropdown
│   └── landing/                    # HeroSection, FeaturesSection, ArchitectureSection, …
├── lib/
│   ├── api.ts                      # REST client
│   ├── ws.ts                       # OrbitWebSocket singleton
│   ├── auth.ts                     # Token helpers
│   ├── orderbook.ts                # WS book → display levels
│   ├── format.ts                   # Number formatting
│   ├── marketOrder.ts              # Client-side market order estimation
│   └── simulator/
│       ├── marketSimulator.ts      # Bot engine class
│       ├── simulatorService.ts     # Singleton service
│       └── useSimulator.ts         # React hook (useSyncExternalStore)
├── types/
│   └── index.ts                    # Shared TypeScript types
└── content/
    └── benchmark.ts                # Landing page benchmark copy
```
