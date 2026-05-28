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
