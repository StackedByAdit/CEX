import type { OrderbookLevel } from "../types";

export function roundInr(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundQty(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export interface MarketEstimate {
  fillableQuantity: number;
  estimatedQuote: number;
  averagePrice: number;
}

export function estimateMarketBuyFromAsks(
  asks: OrderbookLevel[],
  quantity: number,
): MarketEstimate {
  let remaining = roundQty(quantity);
  let estimatedQuote = 0;

  for (const level of asks) {
    if (remaining <= 0) break;
    if (level.amount <= 0) continue;

    const take = Math.min(remaining, level.amount);
    estimatedQuote += take * level.price;
    remaining -= take;
  }

  const fillableQuantity = roundQty(quantity - remaining);
  estimatedQuote = roundInr(estimatedQuote);
  const averagePrice = fillableQuantity > 0 ? roundInr(estimatedQuote / fillableQuantity) : 0;

  return { fillableQuantity, estimatedQuote, averagePrice };
}

export function estimateMarketSellFromBids(
  bids: OrderbookLevel[],
  quantity: number,
): MarketEstimate {
  let remaining = roundQty(quantity);
  let estimatedQuote = 0;

  for (const level of bids) {
    if (remaining <= 0) break;
    if (level.amount <= 0) continue;

    const take = Math.min(remaining, level.amount);
    estimatedQuote += take * level.price;
    remaining -= take;
  }

  const fillableQuantity = roundQty(quantity - remaining);
  estimatedQuote = roundInr(estimatedQuote);
  const averagePrice = fillableQuantity > 0 ? roundInr(estimatedQuote / fillableQuantity) : 0;

  return { fillableQuantity, estimatedQuote, averagePrice };
}
