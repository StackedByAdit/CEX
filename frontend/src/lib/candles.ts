import type { Candle, CandleInterval } from "../types";

const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

/** Normalize API/WS startTime values to epoch milliseconds. */
export function startTimeToMs(startTime: number | string): number {
  if (typeof startTime === "string") {
    return new Date(startTime).getTime();
  }
  return startTime < 1_000_000_000_000 ? startTime * 1000 : startTime;
}

export function getCandleStartMs(timestamp: number, interval: CandleInterval): number {
  const ms = INTERVAL_MS[interval];
  return Math.floor(timestamp / ms) * ms;
}

export function appendCandleIfMissing(candles: Candle[], candle: Candle): Candle[] {
  const candleMs = startTimeToMs(candle.startTime);
  const exists = candles.some((c) => startTimeToMs(c.startTime) === candleMs);
  if (exists) return candles;
  return [...candles, candle];
}
