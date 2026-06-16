import { CANDLES, ORDERBOOK } from "../state";
import { prisma } from "../prisma";
import { publisher } from "../redis";

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Interval = typeof INTERVALS[number];

const INTERVAL_MS: Record<Interval, number> = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
};

function getCandleStart(timestamp: number, interval: Interval): number {
    const ms = INTERVAL_MS[interval];
    return Math.floor(timestamp / ms) * ms;
}

function candleKey(symbol: string, interval: Interval): string {
    return `${symbol}:${interval}`;
}

function persistCandle(candle: (typeof CANDLES)[string]) {
    if (candle.volume <= 0) return;

    prisma.candle.create({
        data: {
            symbol: candle.symbol,
            interval: candle.interval,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            startTime: new Date(candle.startTime),
        },
    }).catch(err => console.error("DB sync error (candle persist):", err));
}

function publishCandle(symbol: string, interval: Interval) {
    const key = candleKey(symbol, interval);
    const candle = CANDLES[key];
    if (!candle) return;

    publisher.publish(`candle:${symbol}:${interval}`, JSON.stringify(candle))
        .catch(err => console.error("Pub/sub error (candle):", err));
}

function serializeDbCandle(candle: {
    symbol: string;
    interval: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    startTime: Date;
}) {
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

export async function getCandleSnapshot(symbol: string, interval: Interval) {
    await advanceCandlesIfNeeded();

    const rows = await prisma.candle.findMany({
        where: { symbol, interval },
        orderBy: { startTime: "desc" },
        take: 200,
    });

    return {
        candles: rows.reverse().map(serializeDbCandle),
        current: CANDLES[candleKey(symbol, interval)] ?? null,
    };
}

function openCandle(
    symbol: string,
    interval: Interval,
    startTime: number,
    price: number,
    quantity: number,
) {
    CANDLES[candleKey(symbol, interval)] = {
        symbol,
        interval,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
        startTime,
    };
}

function rollCandleToStart(
    symbol: string,
    interval: Interval,
    startTime: number,
    lastClose: number,
) {
    openCandle(symbol, interval, startTime, lastClose, 0);
}

/** Advance in-memory candles when wall-clock crosses an interval boundary (even without trades). */
let advancing = false;

export async function advanceCandlesIfNeeded(now = Date.now()) {
    if (advancing) return;

    advancing = true;
    try {
        for (const symbol of Object.keys(ORDERBOOK)) {
            for (const interval of INTERVALS) {
                const key = candleKey(symbol, interval);
                const existing = CANDLES[key];
                if (!existing) continue;

                const expectedStart = getCandleStart(now, interval);
                if (existing.startTime >= expectedStart) continue;

                persistCandle(existing);
                rollCandleToStart(symbol, interval, expectedStart, existing.close);
                publishCandle(symbol, interval);
            }
        }
    } finally {
        advancing = false;
    }
}

export async function processTrade(symbol: string, price: number, quantity: number, timestamp: number) {
    await advanceCandlesIfNeeded(timestamp);

    for (const interval of INTERVALS) {
        const key = candleKey(symbol, interval);
        const startTime = getCandleStart(timestamp, interval);
        const existing = CANDLES[key];

        if (!existing || existing.startTime !== startTime) {
            if (existing) {
                persistCandle(existing);
            }

            openCandle(symbol, interval, startTime, price, quantity);
        } else {
            existing.high = Math.max(existing.high, price);
            existing.low = Math.min(existing.low, price);
            existing.close = price;
            existing.volume += quantity;
        }

        publishCandle(symbol, interval);
    }
}
