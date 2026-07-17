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

export function maxMarketBuyQtyFromAsks(
  asks: OrderbookLevel[],
  inrAvailable: number,
  fallbackPrice: number | null = null,
): number {
  let remainingInr = inrAvailable;
  let quantity = 0;
  let sawLiquidity = false;

  for (const level of asks) {
    if (remainingInr <= 0) break;
    if (level.amount <= 0) continue;

    sawLiquidity = true;
    const affordableQty = remainingInr / level.price;
    const take = Math.min(level.amount, affordableQty);
    if (take <= 0) break;

    quantity += take;
    remainingInr -= take * level.price;
  }

  if (!sawLiquidity && fallbackPrice && fallbackPrice > 0) {
    return roundQty(inrAvailable / fallbackPrice);
  }

  return roundQty(quantity);
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
