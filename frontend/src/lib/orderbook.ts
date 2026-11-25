import type { OrderbookLevel } from "../types";

type RawSide = Record<string, { quantity: number; filledQuantity: number }[] | number>;

function aggregateSide(side: RawSide): Record<string, number> {
  const out: Record<string, number> = {};
  if (!side) return out;
  for (const [price, val] of Object.entries(side)) {
    if (typeof val === "number") {
      if (val > 0) out[price] = val;
    } else if (Array.isArray(val)) {
      let total = 0;
      for (const order of val) {
        total += (order.quantity || 0) - (order.filledQuantity || 0);
      }
      if (total > 0) out[price] = total;
    }
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
