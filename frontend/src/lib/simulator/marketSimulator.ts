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
  funded: boolean;
}

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
    const bot: SimBot = { id, username, token: null, funded: false };

    // 1. Signup (ignore 409 — user already exists)
    try {
      const signupRes = await fetch(`${BASE_URL}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: BOT_PASSWORD }),
      });
      if (!signupRes.ok && signupRes.status !== 409) {
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

    // 2. Login to get token
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

    // 3. Fund bot (if not already)
    if (!bot.funded && bot.token) {
      await this.depositFunds(bot, "INR", 500000);
      await this.depositFunds(bot, this.config.symbol, 5000);
      bot.funded = true;
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

    // Fetch orderbook
    let bestBid = 0;
    let bestAsk = 0;
    try {
      const res = await fetch(`${BASE_URL}/orderbook/${this.config.symbol}`);
      if (res.ok) {
        const data = (await res.json()) as OrderbookResponse;
        const bidPrices = Object.keys(data.bids)
          .map(Number)
          .filter((p) => (data.bids[String(p)] ?? 0) > 0);
        const askPrices = Object.keys(data.asks)
          .map(Number)
          .filter((p) => (data.asks[String(p)] ?? 0) > 0);
        if (bidPrices.length > 0) bestBid = Math.max(...bidPrices);
        if (askPrices.length > 0) bestAsk = Math.min(...askPrices);
      }
    } catch {
      // ignore orderbook fetch errors — use fallback
    }

    // Fallback price if orderbook is empty
    const fallback = 100;
    if (bestBid === 0) bestBid = fallback;
    if (bestAsk === 0) bestAsk = fallback * 1.001;
    if (bestAsk <= bestBid) bestAsk = bestBid * 1.001;

    // Decide order parameters
    const crossRate = CROSS_RATE[this.config.aggression];
    const willCross = Math.random() < crossRate;
    const side: "BUY" | "SELL" = Math.random() < 0.5 ? "BUY" : "SELL";
    const quantity = randInt(1, 20);

    let payload: PlaceOrderPayload;

    if (willCross) {
      // Market order (crosses spread)
      payload = {
        side,
        type: "MARKET",
        symbol: this.config.symbol,
        quantity,
      };
    } else {
      // Passive LIMIT order
      let price: number;
      if (side === "BUY") {
        // Between bestBid*0.99 and bestAsk*0.999 (don't cross)
        price = rand(bestBid * 0.99, bestAsk * 0.999);
      } else {
        // Between bestBid*1.001 and bestAsk*1.01
        price = rand(bestBid * 1.001, bestAsk * 1.01);
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
        detail = `${side} ${payload.type} ${quantity} ${this.config.symbol}${priceStr} → ${data.status ?? "OK"}`;

        this.stats.ordersPlaced += 1;
        this.orderCountThisSecond += 1;
        if (filled > 0) this.stats.fills += 1;
      } else {
        const text = await res.text();
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
