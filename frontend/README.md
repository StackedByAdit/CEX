# ORBIT Exchange Frontend

Premium trading UI for the CEX backend, styled after the ORBIT reference design.

## Prerequisites

- Backend running on `http://localhost:3000`
- WebSocket server on `ws://localhost:8080`
- Redis + PostgreSQL configured for the backend

## Setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Pages

- `/login` — Sign in with username/password
- `/signup` — Create account (pre-funded INR + stock balances)
- `/trade` — Full trading terminal

## Features

- Candlestick chart with intervals: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`
- Live order book via WebSocket
- Limit order placement (buy/sell)
- Open orders, history, trades, and balances panels
- Real-time balance updates via WebSocket

## Build

```bash
npm run build
npm run preview
```

## Environment

Optional `.env`:

```
VITE_WS_URL=ws://localhost:8080
```

API requests are proxied to the backend during development (see `vite.config.ts`).
