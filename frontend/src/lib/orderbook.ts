import type { OrderbookLevel } from "../types";

type RawSide = Record<string, { quantity: number; filledQuantity: number }[]>;

function aggregateSide(side: RawSide): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [price, orders] of Object.entries(side)) {
    let total = 0;
    for (const order of orders) {
      total += order.quantity - order.filledQuantity;
    }
    if (total > 0) out[price] = total;
  }
  return out;
}

function buildLevels(
  book: Record<string, number>,
  ascending: boolean,
): OrderbookLevel[] {
  const entries = Object.entries(book)
    .filter(([, amount]) => amount > 0)
    .map(([price, amount]) => ({
      price: parseFloat(price),
      amount,
      total: 0,
    }));

  entries.sort((a, b) => (ascending ? a.price - b.price : b.price - a.price));

  let cumulative = 0;
  return entries.map((entry) => {
    cumulative += entry.price * entry.amount;
    return { ...entry, total: cumulative };
  });
}

export function levelsFromWsBook(
  bids: RawSide,
  asks: RawSide,
): { bids: OrderbookLevel[]; asks: OrderbookLevel[] } {
  return {
    bids: buildLevels(aggregateSide(bids), false),
    asks: buildLevels(aggregateSide(asks), true),
  };
}
