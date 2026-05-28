import { CANDLES } from "../state";
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

export async function processTrade(symbol: string, price: number, quantity: number, timestamp: number) {
    for (const interval of INTERVALS) {
        const key = candleKey(symbol, interval);
        const startTime = getCandleStart(timestamp, interval);
        const existing = CANDLES[key];

        if (!existing || existing.startTime !== startTime) {
            if (existing) {
                prisma.candle.create({
                    data: {
                        symbol: existing.symbol,
                        interval: existing.interval,
                        open: existing.open,
                        high: existing.high,
                        low: existing.low,
                        close: existing.close,
                        volume: existing.volume,
                        startTime: new Date(existing.startTime),
                    }
                }).catch(err => console.error("DB sync error (candle persist):", err));
            }

            CANDLES[key] = {
                symbol,
                interval,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: quantity,
                startTime,
            };

        } else {
            existing.high = Math.max(existing.high, price);
            existing.low = Math.min(existing.low, price);
            existing.close = price;
            existing.volume += quantity;
        }

        publisher.publish(`candle:${symbol}:${interval}`, JSON.stringify(CANDLES[key]))
            .catch(err => console.error("Pub/sub error (candle):", err));
    }
}