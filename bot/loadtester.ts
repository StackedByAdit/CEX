/**
 * ORBIT Exchange - Comprehensive Load Tester
 * Evaluates throughput, concurrency limits, latencies, and matching engine limits.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SYMBOLS = ["SOL"];

interface Trader {
  username: string;
  token: string;
  id: string;
}

interface OrderMetric {
  latencyMs: number;
  success: boolean;
  status?: string;
  fillsCount?: number;
  error?: string;
}

interface TestResult {
  stageName: string;
  totalOrders: number;
  successCount: number;
  failCount: number;
  totalDurationMs: number;
  throughputTps: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  filledOrders: number;
  pendingOrders: number;
  errors: Record<string, number>;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.floor(sorted.length * (p / 100)), sorted.length - 1);
  return sorted[idx] ?? 0;
}

async function requestJson(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function setupTraders(count: number): Promise<Trader[]> {
  console.log(`\n[SETUP] Initializing ${count} trader accounts...`);
  const traders: Trader[] = [];
  const batchSize = 10;

  for (let i = 0; i < count; i += batchSize) {
    const chunk = Math.min(batchSize, count - i);
    const promises = Array.from({ length: chunk }, async (_, idx) => {
      const num = i + idx + 1;
      const username = `trader_${Date.now()}_${num}_${Math.random().toString(36).slice(2, 6)}`;
      const password = "password123";

      // 1. Signup
      await requestJson(`${BASE_URL}/signup`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      // 2. Login
      const loginRes = await requestJson(`${BASE_URL}/login`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      const token = loginRes.data.token;
      if (!token) {
        throw new Error(`Failed to log in ${username}: ${JSON.stringify(loginRes.data)}`);
      }

      // 3. Deposit INR and SOL
      await requestJson(`${BASE_URL}/deposit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: 10_000_000, symbol: "INR" }),
      });

      await requestJson(`${BASE_URL}/deposit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: 100_000, symbol: "SOL" }),
      });

      return { username, token, id: username };
    });

    const readyChunk = await Promise.all(promises);
    traders.push(...readyChunk);
    process.stdout.write(`  Registered & funded: ${traders.length}/${count}\r`);
  }

  console.log(`\n[SETUP] Successfully prepared ${traders.length} traders.`);
  return traders;
}

async function placeSingleOrder(
  trader: Trader,
  symbol: string,
  side: "BUY" | "SELL",
  price: number,
  quantity: number,
  type: "LIMIT" | "MARKET" = "LIMIT"
): Promise<OrderMetric> {
  const start = performance.now();
  try {
    const body: Record<string, unknown> = {
      side,
      type,
      symbol,
      quantity,
    };
    if (type === "LIMIT") {
      body.price = price;
    }

    const res = await requestJson(`${BASE_URL}/order`, {
      method: "POST",
      headers: { Authorization: `Bearer ${trader.token}` },
      body: JSON.stringify(body),
    });

    const latency = performance.now() - start;

    if (!res.ok) {
      return {
        latencyMs: latency,
        success: false,
        error: res.data?.message || `HTTP ${res.status}`,
      };
    }

    return {
      latencyMs: latency,
      success: true,
      status: res.data.status,
      fillsCount: res.data.fills?.length || 0,
    };
  } catch (err: unknown) {
    const latency = performance.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { latencyMs: latency, success: false, error: msg };
  }
}

async function runStage(
  stageName: string,
  traders: Trader[],
  totalOrders: number,
  concurrency: number
): Promise<TestResult> {
  console.log(`\n===============================================================`);
  console.log(` RUNNING: ${stageName}`);
  console.log(` Total Orders: ${totalOrders} | Concurrency: ${concurrency} parallel requests`);
  console.log(` Active Traders: ${traders.length}`);
  console.log(`===============================================================`);

  const metrics: OrderMetric[] = [];
  const errors: Record<string, number> = {};
  let filledOrders = 0;
  let pendingOrders = 0;

  const startAll = performance.now();
  let submitted = 0;

  while (submitted < totalOrders) {
    const currentBatch = Math.min(concurrency, totalOrders - submitted);
    const promises: Promise<OrderMetric>[] = [];

    for (let i = 0; i < currentBatch; i++) {
      const trader = traders[(submitted + i) % traders.length]!;
      const isBuy = (submitted + i) % 2 === 0;
      const basePrice = 100;
      // Slight spread variation between 98 and 102 to create natural matches
      const priceOffset = ((submitted + i) % 7) - 3;
      const price = basePrice + priceOffset;
      const quantity = Math.floor(Math.random() * 3) + 1;

      promises.push(
        placeSingleOrder(trader, "SOL", isBuy ? "BUY" : "SELL", price, quantity, "LIMIT")
      );
    }

    const batchResults = await Promise.all(promises);
    for (const m of batchResults) {
      metrics.push(m);
      if (m.success) {
        if (m.status === "FILLED" || m.status === "PARTIALLY_FILLED") {
          filledOrders++;
        } else {
          pendingOrders++;
        }
      } else {
        const err = m.error || "Unknown";
        errors[err] = (errors[err] || 0) + 1;
      }
    }

    submitted += currentBatch;
    process.stdout.write(
      `  Progress: ${submitted}/${totalOrders} (${Math.round((submitted / totalOrders) * 100)}%)\r`
    );
  }

  const endAll = performance.now();
  const totalDurationMs = endAll - startAll;
  const throughputTps = totalOrders / (totalDurationMs / 1000);

  const latencies = metrics.map((m) => m.latencyMs).sort((a, b) => a - b);
  const successCount = metrics.filter((m) => m.success).length;
  const failCount = metrics.filter((m) => !m.success).length;

  const result: TestResult = {
    stageName,
    totalOrders,
    successCount,
    failCount,
    totalDurationMs,
    throughputTps,
    p50Ms: percentile(latencies, 50),
    p90Ms: percentile(latencies, 90),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    minMs: latencies[0] || 0,
    maxMs: latencies[latencies.length - 1] || 0,
    filledOrders,
    pendingOrders,
    errors,
  };

  printStageResult(result);
  return result;
}

function printStageResult(r: TestResult) {
  console.log(`\n\n--- RESULTS: ${r.stageName} ---`);
  console.log(`  Duration:         ${(r.totalDurationMs / 1000).toFixed(2)}s (${r.totalDurationMs.toFixed(1)} ms)`);
  console.log(`  Throughput:       ${r.throughputTps.toFixed(2)} orders/sec (TPS)`);
  console.log(`  Success / Failed: ${r.successCount} / ${r.failCount} (${((r.successCount / r.totalOrders) * 100).toFixed(1)}% success)`);
  console.log(`  Matched / Resting:${r.filledOrders} filled / ${r.pendingOrders} resting`);
  console.log(`  Latency Percentiles:`);
  console.log(`    Min:  ${r.minMs.toFixed(2)} ms`);
  console.log(`    p50:  ${r.p50Ms.toFixed(2)} ms`);
  console.log(`    p90:  ${r.p90Ms.toFixed(2)} ms`);
  console.log(`    p95:  ${r.p95Ms.toFixed(2)} ms`);
  console.log(`    p99:  ${r.p99Ms.toFixed(2)} ms`);
  console.log(`    Max:  ${r.maxMs.toFixed(2)} ms`);

  if (Object.keys(r.errors).length > 0) {
    console.log(`  Error Breakdown:`);
    for (const [err, count] of Object.entries(r.errors)) {
      console.log(`    - "${err}": ${count}`);
    }
  }
}

async function main() {
  console.log("===============================================================");
  console.log("          ORBIT EXCHANGE - MAXIMUM LOAD TEST SUITE            ");
  console.log(`          Target Server: ${BASE_URL}                         `);
  console.log("===============================================================");

  // Check health
  const health = await fetch(`${BASE_URL}/stocks`).catch(() => null);
  if (!health) {
    console.error(`\n[ERROR] Cannot reach server at ${BASE_URL}. Ensure 'bun run src/index.ts' is running.`);
    process.exit(1);
  }

  // 1. Setup 50 traders
  const TRADER_COUNT = 50;
  const traders = await setupTraders(TRADER_COUNT);

  // 2. Stage 1: Warmup & baseline (10 users, 100 orders, concurrency 5)
  await runStage("Stage 1: Warmup & Baseline", traders.slice(0, 10), 100, 5);

  // 3. Stage 2: Medium Load (25 users, 250 orders, concurrency 15)
  await runStage("Stage 2: Medium Concurrency", traders.slice(0, 25), 250, 15);

  // 4. Stage 3: High Concurrency (50 users, 500 orders, concurrency 30)
  await runStage("Stage 3: High Concurrency", traders, 500, 30);

  // 5. Stage 4: Stress Burst (50 users, 500 orders, concurrency 50 max burst)
  await runStage("Stage 4: Maximum Concurrency Burst", traders, 500, 50);

  console.log("\n===============================================================");
  console.log("           ALL LOAD TEST STAGES COMPLETED                     ");
  console.log("===============================================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Load test fatal error:", err);
  process.exit(1);
});
