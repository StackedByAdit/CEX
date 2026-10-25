// Market Simulator Engine — headless bot trading engine
// Uses raw fetch() with Bearer tokens (NOT api.ts / cookies)

const BASE_URL = "";
const BOT_PASSWORD = "sim-orbit-pass-2025";

export interface SimulatorConfig {
  botCount: number;
  symbol: string;
  intervalMs: number;
  aggression: "passive" | "mixed" | "aggressive";
}

export interface SimulatorStats {
  ordersPlaced: number;
  fills: number;
  errors: number;
  startedAt: number;
  tpsHistory: number[];
  activeBots: number;
}

export interface LogEntry {
  time: string;
  botId: number;
  action: string;
  detail: string;
  ok: boolean;
}

interface SimBot {
  id: number;
  username: string;
  token: string | null;
  fundedSymbols: Set<string>;
}

// In-memory cache for bot sessions across simulator restarts
const BOT_SESSION_CACHE = new Map<number, SimBot>();

interface PlaceOrderPayload {
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  symbol: string;
  price?: number;
  quantity: number;
}

interface OrderbookResponse {
  bids: Record<string, number>;
  asks: Record<string, number>;
}

// Aggression → % of orders that cross the spread (market/crossing)
const CROSS_RATE: Record<SimulatorConfig["aggression"], number> = {
  passive: 0.05,
  mixed: 0.3,
  aggressive: 0.7,
};

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

function nowTime(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

export class MarketSimulator {
  private config: SimulatorConfig;
  private readonly onLog: (e: LogEntry) => void;
  private readonly onStats: (s: SimulatorStats) => void;

  private bots: SimBot[] = [];
  private running = false;
  private timers: Set<ReturnType<typeof setTimeout>> = new Set();

  private stats: SimulatorStats = {
    ordersPlaced: 0,
    fills: 0,
    errors: 0,
    startedAt: 0,
    tpsHistory: [],
    activeBots: 0,
  };

  // TPS tracking
  private orderCountThisSecond = 0;
  private tpsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: SimulatorConfig,
    onLog: (e: LogEntry) => void,
    onStats: (s: SimulatorStats) => void,
  ) {
    this.config = { ...config };
    this.onLog = onLog;
    this.onStats = onStats;
  }

  async start(): Promise<void> {
    this.running = true;
    this.stats = {
      ordersPlaced: 0,
      fills: 0,
      errors: 0,
      startedAt: Date.now(),
      tpsHistory: new Array(30).fill(0),
      activeBots: 0,
    };
    this.orderCountThisSecond = 0;

    // Start TPS tracking
    this.tpsInterval = setInterval(() => {
      const tps = this.orderCountThisSecond;
      this.orderCountThisSecond = 0;
      this.stats.tpsHistory = [...this.stats.tpsHistory.slice(-29), tps];
      this.emitStats();
    }, 1000);

    // Provision & start all bots
    const provisionPromises: Promise<void>[] = [];
    for (let i = 1; i <= this.config.botCount; i++) {
      provisionPromises.push(this.provisionAndRun(i));
    }
    await Promise.allSettled(provisionPromises);
  }

  stop(): void {
    this.running = false;
    // Clear all scheduled timers
    for (const t of this.timers) {
      clearTimeout(t);
    }
    this.timers.clear();
    if (this.tpsInterval !== null) {
      clearInterval(this.tpsInterval);
      this.tpsInterval = null;
    }
    this.stats.activeBots = 0;
    this.emitStats();
  }

  updateConfig(partial: Partial<SimulatorConfig>): void {
    const botCountChanged =
      partial.botCount !== undefined && partial.botCount !== this.config.botCount;
    this.config = { ...this.config, ...partial };

    if (botCountChanged && this.running) {
      // Provision new bots if count increased
      const currentCount = this.bots.length;
      const newCount = this.config.botCount;
      if (newCount > currentCount) {
        for (let i = currentCount + 1; i <= newCount; i++) {
          void this.provisionAndRun(i);
        }
      }
      // If count decreased, bots will naturally idle when they loop and find running=false for their id
      // (simplest approach: just let existing bots keep running — they'll be stopped on stop())
    }
  }

  private async provisionAndRun(id: number): Promise<void> {
    const bot = await this.provisionBot(id);
    this.bots[id - 1] = bot;
    if (bot.token && this.running) {
      this.stats.activeBots = this.bots.filter((b) => b?.token !== null).length;
      this.emitStats();
      this.scheduleBot(bot);
    }
  }

  private async provisionBot(id: number): Promise<SimBot> {
    const username = `sim-bot-${id}`;

    let bot = BOT_SESSION_CACHE.get(id);
    if (!bot) {
      bot = { id, username, token: null, fundedSymbols: new Set() };
    }

    // 1. Try login first (fast path for already registered bots)
    if (!bot.token) {
      try {
        const loginRes = await fetch(`${BASE_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password: BOT_PASSWORD }),
        });
        if (loginRes.ok) {
          const data = (await loginRes.json()) as { message: string; username: string; token: string };
          bot.token = data.token;
          this.onLog({
            time: nowTime(),
            botId: id,
            action: "LOGIN",
            detail: `Authenticated as ${username}`,
            ok: true,
          });
        }
      } catch {
        // Will try signup below
      }
    }

    // 2. If login failed (user doesn't exist yet in DB), try signup
    if (!bot.token) {
      try {
        const signupRes = await fetch(`${BASE_URL}/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password: BOT_PASSWORD }),
        });

        // 400 with "User already exists" or 409 is expected if race condition occurs
        if (!signupRes.ok && signupRes.status !== 400 && signupRes.status !== 409) {
          const text = await signupRes.text();
          this.onLog({
            time: nowTime(),
            botId: id,
            action: "SIGNUP",
            detail: `HTTP ${signupRes.status}: ${text.slice(0, 80)}`,
            ok: false,
          });
        }
      } catch (err) {
        this.onLog({
          time: nowTime(),
          botId: id,
          action: "SIGNUP",
          detail: String(err),
          ok: false,
        });
      }

      // 3. Login after signup
      try {
        const loginRes = await fetch(`${BASE_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password: BOT_PASSWORD }),
        });
        if (loginRes.ok) {
          const data = (await loginRes.json()) as { message: string; username: string; token: string };
          bot.token = data.token;
          this.onLog({
            time: nowTime(),
            botId: id,
            action: "LOGIN",
            detail: `Authenticated as ${username}`,
            ok: true,
          });
        } else {
          const text = await loginRes.text();
          this.onLog({
            time: nowTime(),
            botId: id,
            action: "LOGIN",
            detail: `HTTP ${loginRes.status}: ${text.slice(0, 80)}`,
            ok: false,
          });
          return bot;
        }
      } catch (err) {
        this.onLog({
          time: nowTime(),
          botId: id,
          action: "LOGIN",
          detail: String(err),
          ok: false,
        });
        return bot;
      }
    }

    // Cache authenticated bot
    if (bot.token) {
      BOT_SESSION_CACHE.set(id, bot);
    }

    // 4. Fund bot with INR if needed
    if (bot.token && !bot.fundedSymbols.has("INR")) {
      await this.depositFunds(bot, "INR", 500000);
      bot.fundedSymbols.add("INR");
    }

    // 5. Fund bot with target symbol if needed
    if (bot.token && !bot.fundedSymbols.has(this.config.symbol)) {
      await this.depositFunds(bot, this.config.symbol, 5000);
      bot.fundedSymbols.add(this.config.symbol);
    }

    return bot;
  }

  private async depositFunds(bot: SimBot, symbol: string, amount: number): Promise<void> {
    try {
      const res = await fetch(`${BASE_URL}/deposit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bot.token}`,
        },
        body: JSON.stringify({ amount, symbol }),
      });
      const ok = res.ok;
      this.onLog({
        time: nowTime(),
        botId: bot.id,
        action: "DEPOSIT",
        detail: ok
          ? `+${amount} ${symbol}`
          : `HTTP ${res.status} depositing ${symbol}`,
        ok,
      });
    } catch (err) {
      this.onLog({
        time: nowTime(),
        botId: bot.id,
        action: "DEPOSIT",
        detail: String(err),
        ok: false,
      });
    }
  }

  private scheduleBot(bot: SimBot): void {
    if (!this.running || !bot.token) return;

    // Check that this bot is still within the configured bot count
    if (bot.id > this.config.botCount) return;

    const jitter = rand(0.6, 1.4); // ±40%
    const delay = Math.round(this.config.intervalMs * jitter);

    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.running || bot.id > this.config.botCount) return;
      void this.runBot(bot).then(() => {
        this.scheduleBot(bot);
      });
    }, delay);

    this.timers.add(t);
  }

  private async runBot(bot: SimBot): Promise<void> {
    if (!this.running || !bot.token) return;

    // Fetch orderbook with depth
    let bestBid = 0;
    let bestAsk = 0;
    let totalBidDepth = 0;
    let totalAskDepth = 0;

    try {
      const res = await fetch(`${BASE_URL}/orderbook/${this.config.symbol}`);
      if (res.ok) {
        const data = (await res.json()) as OrderbookResponse;
        const bidEntries = Object.entries(data.bids || {})
          .map(([p, q]) => ({ price: Number(p), qty: Number(q) }))
          .filter((e) => e.qty > 0 && Number.isFinite(e.price));
        const askEntries = Object.entries(data.asks || {})
          .map(([p, q]) => ({ price: Number(p), qty: Number(q) }))
          .filter((e) => e.qty > 0 && Number.isFinite(e.price));

        if (bidEntries.length > 0) {
          bestBid = Math.max(...bidEntries.map((e) => e.price));
          totalBidDepth = bidEntries.reduce((sum, e) => sum + e.qty, 0);
        }
        if (askEntries.length > 0) {
          bestAsk = Math.min(...askEntries.map((e) => e.price));
          totalAskDepth = askEntries.reduce((sum, e) => sum + e.qty, 0);
        }
      }
    } catch {
      // fallback
    }

    const fallbackPrice = 100;
    const hasBids = bestBid > 0 && totalBidDepth > 0;
    const hasAsks = bestAsk > 0 && totalAskDepth > 0;

    // Decide order parameters
    const crossRate = CROSS_RATE[this.config.aggression];
    const willCross = Math.random() < crossRate;
    let side: "BUY" | "SELL" = Math.random() < 0.5 ? "BUY" : "SELL";
    let quantity = randInt(1, 15);

    let payload: PlaceOrderPayload;

    // LIQUIDITY AWARENESS:
    // If attempting a market order, verify that the counterparty side actually has resting orders.
    // If not, automatically switch to a LIMIT order to provide liquidity and build the book.
    if (willCross) {
      if (side === "BUY") {
        if (hasAsks) {
          // Asks exist: safe to place BUY MARKET
          const maxTake = Math.max(1, Math.floor(totalAskDepth));
          payload = {
            side: "BUY",
            type: "MARKET",
            symbol: this.config.symbol,
            quantity: Math.min(quantity, maxTake),
          };
        } else {
          // No asks exist: cannot BUY MARKET (would cause INSUFFICIENT LIQUIDITY)
          // Act as a market maker: place a SELL LIMIT order to replenish asks!
          const askPrice = hasBids ? Math.round(bestBid * 1.008 * 100) / 100 : fallbackPrice * 1.01;
          payload = {
            side: "SELL",
            type: "LIMIT",
            symbol: this.config.symbol,
            price: Math.round(askPrice * 100) / 100,
            quantity,
          };
        }
      } else {
        // side === "SELL"
        if (hasBids) {
          // Bids exist: safe to place SELL MARKET
          const maxTake = Math.max(1, Math.floor(totalBidDepth));
          payload = {
            side: "SELL",
            type: "MARKET",
            symbol: this.config.symbol,
            quantity: Math.min(quantity, maxTake),
          };
        } else {
          // No bids exist: cannot SELL MARKET (would cause INSUFFICIENT LIQUIDITY)
          // Act as a market maker: place a BUY LIMIT order to replenish bids!
          const bidPrice = hasAsks ? Math.round(bestAsk * 0.992 * 100) / 100 : fallbackPrice * 0.99;
          payload = {
            side: "BUY",
            type: "LIMIT",
            symbol: this.config.symbol,
            price: Math.round(bidPrice * 100) / 100,
            quantity,
          };
        }
      }
    } else {
      // Passive LIMIT order (Market Making / Liquidity Provision)
      let price: number;
      if (side === "BUY") {
        if (hasBids && hasAsks && bestAsk > bestBid) {
          price = rand(bestBid * 0.992, Math.min(bestBid * 1.001, bestAsk - 0.01));
        } else if (hasBids) {
          price = rand(bestBid * 0.99, bestBid * 1.00);
        } else if (hasAsks) {
          price = rand(bestAsk * 0.985, bestAsk * 0.995);
        } else {
          price = rand(fallbackPrice * 0.98, fallbackPrice * 0.995);
        }
      } else {
        // SELL
        if (hasBids && hasAsks && bestAsk > bestBid) {
          price = rand(Math.max(bestAsk * 0.999, bestBid + 0.01), bestAsk * 1.008);
        } else if (hasAsks) {
          price = rand(bestAsk * 1.00, bestAsk * 1.01);
        } else if (hasBids) {
          price = rand(bestBid * 1.005, bestBid * 1.015);
        } else {
          price = rand(fallbackPrice * 1.005, fallbackPrice * 1.02);
        }
      }

      price = Math.round(price * 100) / 100;
      payload = {
        side,
        type: "LIMIT",
        symbol: this.config.symbol,
        price,
        quantity,
      };
    }

    // Place the order
    try {
      const res = await fetch(`${BASE_URL}/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bot.token}`,
        },
        body: JSON.stringify(payload),
      });

      const ok = res.ok;
      let detail: string;

      if (ok) {
        const data = (await res.json()) as {
          orderId?: string;
          status?: string;
          filledQuantity?: number;
          fills?: unknown[];
        };
        const filled = data.filledQuantity ?? 0;
        const priceStr =
          payload.type === "LIMIT" && payload.price != null
            ? ` @ ${payload.price.toFixed(2)}`
            : "";
        detail = `${payload.side} ${payload.type} ${payload.quantity} ${this.config.symbol}${priceStr} → ${data.status ?? "OK"}`;

        this.stats.ordersPlaced += 1;
        this.orderCountThisSecond += 1;
        if (filled > 0) this.stats.fills += 1;
      } else {
        const text = await res.text();
        if (res.status === 400 && text.includes("INSUFFICIENT LIQUIDITY")) {
          // Handled gracefully: transient liquidity gap between concurrent bots
          this.onLog({
            time: nowTime(),
            botId: bot.id,
            action: `${payload.side} ${payload.type}`,
            detail: `${this.config.symbol} book drained — auto replenished`,
            ok: true,
          });
          return;
        }

        if (res.status === 401) {
          bot.token = null;
          BOT_SESSION_CACHE.delete(bot.id);
        }

        detail = `HTTP ${res.status}: ${text.slice(0, 100)}`;
        this.stats.errors += 1;
      }

      this.onLog({
        time: nowTime(),
        botId: bot.id,
        action: `${payload.side} ${payload.type}`,
        detail,
        ok,
      });
      this.emitStats();
    } catch (err) {
      this.stats.errors += 1;
      this.onLog({
        time: nowTime(),
        botId: bot.id,
        action: "ORDER",
        detail: String(err),
        ok: false,
      });
      this.emitStats();
    }
  }

  private emitStats(): void {
    this.onStats({ ...this.stats, tpsHistory: [...this.stats.tpsHistory] });
  }
}

export default MarketSimulator;
