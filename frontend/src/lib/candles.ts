import type { Candle, CandleInterval } from "../types";

const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export interface CandleSeriesSnapshot {
  candles: Candle[];
  current: Candle | null;
}

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

export function candleSeriesKey(symbol: string, interval: CandleInterval | string): string {
  return `${symbol}:${interval}`;
}

export function sortCandles(candles: Candle[]): Candle[] {
  return [...candles].sort((a, b) => startTimeToMs(a.startTime) - startTimeToMs(b.startTime));
}

export function appendCandleIfMissing(candles: Candle[], candle: Candle): Candle[] {
  const candleMs = startTimeToMs(candle.startTime);
  if (candles.some((c) => startTimeToMs(c.startTime) === candleMs)) {
    return sortCandles(candles);
  }
  return sortCandles([...candles, candle]);
}

/** Split payload into sorted history + live candle without duplicate timestamps. */
export function normalizeCandleFetchResponse(
  candles: Candle[],
  current: Candle | null,
): CandleSeriesSnapshot {
  if (!current) {
    return { candles: sortCandles(candles), current: null };
  }

  const currentMs = startTimeToMs(current.startTime);
  const historical = sortCandles(
    candles.filter((c) => startTimeToMs(c.startTime) !== currentMs),
  );

  return { candles: historical, current };
}

function pickFresherCurrent(a: Candle | null, b: Candle | null): Candle | null {
  if (!a) return b;
  if (!b) return a;
  return startTimeToMs(b.startTime) >= startTimeToMs(a.startTime) ? b : a;
}

/** Merge two snapshots without dropping the longer history. */
export function mergeSeriesSnapshots(
  base: CandleSeriesSnapshot,
  incoming: CandleSeriesSnapshot,
): CandleSeriesSnapshot {
  const candles =
    incoming.candles.length >= base.candles.length ? incoming.candles : base.candles;
  const current = pickFresherCurrent(base.current, incoming.current);
  return normalizeCandleFetchResponse(candles, current);
}

export function applyLiveCandleUpdate(
  snapshot: CandleSeriesSnapshot,
  next: Candle,
  rollForward: boolean,
): CandleSeriesSnapshot {
  const candles = rollForward && snapshot.current
    ? appendCandleIfMissing(snapshot.candles, snapshot.current)
    : snapshot.candles;

  return normalizeCandleFetchResponse(candles, next);
}

export class CandleSeriesCache {
  private entries = new Map<string, CandleSeriesSnapshot>();

  get(key: string): CandleSeriesSnapshot | undefined {
    return this.entries.get(key);
  }

  set(key: string, snapshot: CandleSeriesSnapshot) {
    this.entries.set(key, snapshot);
  }

  update(key: string, updater: (prev: CandleSeriesSnapshot) => CandleSeriesSnapshot) {
    const prev = this.entries.get(key) ?? { candles: [], current: null };
    const next = updater(prev);
    this.entries.set(key, next);
    return next;
  }
}
