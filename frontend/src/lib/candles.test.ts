import { describe, expect, test } from "bun:test";
import {
  mergeSeriesSnapshots,
  normalizeCandleFetchResponse,
} from "./candles";
import type { Candle } from "../types";

function candle(startTime: number, close: number): Candle {
  return {
    symbol: "SOL",
    interval: "1m",
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    startTime,
  };
}

describe("candle series merge", () => {
  test("mergeSeriesSnapshots keeps longer history from fetch", () => {
    const wsOnly = normalizeCandleFetchResponse([], candle(1_000, 100));
    const fetched = normalizeCandleFetchResponse(
      [candle(60_000, 99), candle(120_000, 98)],
      candle(180_000, 101),
    );

    const merged = mergeSeriesSnapshots(wsOnly, fetched);

    expect(merged.candles).toHaveLength(2);
    expect(merged.current?.close).toBe(101);
  });

  test("normalizeCandleFetchResponse dedupes current from history", () => {
    const snapshot = normalizeCandleFetchResponse(
      [candle(60_000, 99), candle(120_000, 100)],
      candle(120_000, 100),
    );

    expect(snapshot.candles).toHaveLength(1);
    expect(snapshot.current?.startTime).toBe(120_000);
  });
});
