import { CANDLES, ORDERBOOK } from "../state";
import { prisma } from "../prisma";
import { publisher } from "../redis";

// Only 1m candles are persisted; all other intervals are derived from 1m on read.
const INTERVAL_1M_MS = 60_000;

export type Interval = "1m" | "15m" | "1h" | "4h" | "1d";

const INTERVAL_MS: Record<Interval, number> = {
    "1m": 60_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
};

function getCandleStart(timestamp: number, intervalMs: number): number {
    return Math.floor(timestamp / intervalMs) * intervalMs;
}

function candleKey(symbol: string): string {
    return `${symbol}:1m`;
}

function persist1mCandle(candle: (typeof CANDLES)[string]) {
    if (candle.volume <= 0) return;

    prisma.candle.upsert({
        where: {
            symbol_interval_startTime: {
                symbol: candle.symbol,
                interval: "1m",
                startTime: new Date(candle.startTime),
            },
        },
        create: {
            symbol: candle.symbol,
            interval: "1m",
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            startTime: new Date(candle.startTime),
        },
        update: {
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
        },
    }).catch(err => console.error("DB sync error (candle persist):", err));
}

function publish1mCandle(symbol: string) {
    const candle = CANDLES[candleKey(symbol)];
    if (!candle) return;

    publisher.publish(`candle:${symbol}:1m`, JSON.stringify(candle))
        .catch(err => console.error("Pub/sub error (candle):", err));
}

interface DbCandle {
    symbol: string;
    interval: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    startTime: Date;
}

interface SerializedCandle {
    symbol: string;
    interval: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    startTime: number;
}

function serializeDbCandle(candle: DbCandle): SerializedCandle {
    return {
        symbol: candle.symbol,
        interval: candle.interval,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        startTime: candle.startTime.getTime(),
    };
}

/** Aggregate sorted 1m rows into a coarser interval. */
function aggregate1m(rows: SerializedCandle[], interval: Interval, symbol: string): SerializedCandle[] {
    const bucketMs = INTERVAL_MS[interval];
    const buckets = new Map<number, SerializedCandle>();

    for (const row of rows) {
        const bucketStart = getCandleStart(row.startTime, bucketMs);
        const existing = buckets.get(bucketStart);
        if (!existing) {
            buckets.set(bucketStart, { ...row, interval, startTime: bucketStart, symbol });
        } else {
            existing.high = Math.max(existing.high, row.high);
            existing.low = Math.min(existing.low, row.low);
            existing.close = row.close;
            existing.volume += row.volume;
        }
    }

    return Array.from(buckets.values()).sort((a, b) => a.startTime - b.startTime);
}

export async function getCandleSnapshot(symbol: string, interval: Interval) {
    await advanceCandlesIfNeeded();

    // How many 1m rows we need to produce ~200 candles of the target interval.
    // Capped to keep queries fast; a young exchange won't have months of 1m data.
    const rowsPerCandle = Math.ceil(INTERVAL_MS[interval] / INTERVAL_1M_MS);
    const lookbackRows = Math.min(rowsPerCandle * 200, 25_000);

    const rows1m = await prisma.candle.findMany({
        where: { symbol, interval: "1m" },
        orderBy: { startTime: "desc" },
        take: lookbackRows,
    });

    const serialized = rows1m.reverse().map(serializeDbCandle);

    let historicalCandles: SerializedCandle[];
    if (interval === "1m") {
        historicalCandles = serialized;
    } else {
        historicalCandles = aggregate1m(serialized, interval, symbol);
    }

    const live1m = CANDLES[candleKey(symbol)] ?? null;

    if (!live1m) {
        return { candles: historicalCandles, current: null };
    }

    const liveStart = getCandleStart(live1m.startTime, INTERVAL_MS[interval]);

    if (interval === "1m") {
        // current is the live 1m candle
        const historical = historicalCandles.filter(c => c.startTime !== live1m.startTime);
        return { candles: historical, current: { ...live1m, interval } };
    }

    // For derived intervals: find if the live 1m bucket overlaps the last historical candle
    const lastHistorical = historicalCandles.at(-1);
    if (lastHistorical && lastHistorical.startTime === liveStart) {
        // Merge live 1m into the last derived candle
        const current: SerializedCandle = {
            symbol,
            interval,
            startTime: liveStart,
            open: lastHistorical.open,
            high: Math.max(lastHistorical.high, live1m.high),
            low: Math.min(lastHistorical.low, live1m.low),
            close: live1m.close,
            volume: lastHistorical.volume + (live1m.volume > 0 ? live1m.volume : 0),
        };
        const historical = historicalCandles.slice(0, -1);
        return { candles: historical, current };
    }

    // Live 1m is in a new bucket not yet represented in history
    const current: SerializedCandle = {
        symbol,
        interval,
        startTime: liveStart,
        open: live1m.open,
        high: live1m.high,
        low: live1m.low,
        close: live1m.close,
        volume: live1m.volume,
    };
    return { candles: historicalCandles, current };
}

function openCandle(
    symbol: string,
    startTime: number,
    price: number,
    quantity: number,
) {
    CANDLES[candleKey(symbol)] = {
        symbol,
        interval: "1m",
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
        startTime,
    };
}

let advancing = false;

export async function advanceCandlesIfNeeded(now = Date.now()) {
    if (advancing) return;

    advancing = true;
    try {
        for (const symbol of Object.keys(ORDERBOOK)) {
            const key = candleKey(symbol);
            const existing = CANDLES[key];
            if (!existing) continue;

            const expectedStart = getCandleStart(now, INTERVAL_1M_MS);
            if (existing.startTime >= expectedStart) continue;

            persist1mCandle(existing);
            openCandle(symbol, expectedStart, existing.close, 0);
            publish1mCandle(symbol);
        }
    } finally {
        advancing = false;
    }
}

export async function processTrade(symbol: string, price: number, quantity: number, timestamp: number) {
    advanceCandlesIfNeeded(timestamp).catch(err => {
        console.error("Candle advance error in processTrade:", err);
    });

    const key = candleKey(symbol);
    const startTime = getCandleStart(timestamp, INTERVAL_1M_MS);
    const existing = CANDLES[key];

    if (!existing || existing.startTime !== startTime) {
        if (existing) {
            persist1mCandle(existing);
        }
        openCandle(symbol, startTime, price, quantity);
    } else {
        existing.high = Math.max(existing.high, price);
        existing.low = Math.min(existing.low, price);
        existing.close = price;
        existing.volume += quantity;
    }

    publish1mCandle(symbol);
}

export async function processTradesBatch(
    symbol: string,
    fills: { price: number; quantity: number }[],
    timestamp: number
) {
    if (fills.length === 0) return;

    advanceCandlesIfNeeded(timestamp).catch(err => {
        console.error("Candle advance error in processTradesBatch:", err);
    });

    const key = candleKey(symbol);
    const startTime = getCandleStart(timestamp, INTERVAL_1M_MS);
    const existing = CANDLES[key];

    const prices = fills.map(f => f.price);
    const batchHigh = Math.max(...prices);
    const batchLow = Math.min(...prices);
    const batchClose = fills[fills.length - 1]!.price;
    const batchVolume = fills.reduce((sum, f) => sum + f.quantity, 0);

    if (!existing || existing.startTime !== startTime) {
        if (existing) {
            persist1mCandle(existing);
        }
        const batchOpen = fills[0]!.price;
        CANDLES[key] = {
            symbol,
            interval: "1m",
            open: batchOpen,
            high: batchHigh,
            low: batchLow,
            close: batchClose,
            volume: batchVolume,
            startTime,
        };
    } else {
        existing.high = Math.max(existing.high, batchHigh);
        existing.low = Math.min(existing.low, batchLow);
        existing.close = batchClose;
        existing.volume += batchVolume;
    }

    publish1mCandle(symbol);
}


