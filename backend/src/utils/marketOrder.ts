import { ORDERBOOK } from "../state";

export interface MarketWalkFill {
    price: number;
    quantity: number;
}

export interface MarketWalkResult {
    fillableQuantity: number;
    estimatedQuote: number;
    averagePrice: number;
    fills: MarketWalkFill[];
}

export function roundInr(value: number): number {
    return Math.round(value * 100) / 100;
}

export function roundQty(value: number): number {
    return Math.round(value * 10000) / 10000;
}

function availableAtPrice(orders: { quantity: number; filledQuantity: number }[]): number {
    let total = 0;
    for (const order of orders) {
        total += order.quantity - order.filledQuantity;
    }
    return total;
}

export function walkAsks(symbol: string, quantity: number): MarketWalkResult {
    const firm = ORDERBOOK[symbol];
    if (!firm || quantity <= 0) {
        return { fillableQuantity: 0, estimatedQuote: 0, averagePrice: 0, fills: [] };
    }

    const askPrices = Object.keys(firm.asks).map(Number).sort((a, b) => a - b);
    let remaining = quantity;
    let estimatedQuote = 0;
    const fills: MarketWalkFill[] = [];

    for (const price of askPrices) {
        if (remaining <= 0) break;

        const ordersAtPrice = firm.asks[price];
        if (!ordersAtPrice) continue;

        const available = availableAtPrice(ordersAtPrice);
        if (available <= 0) continue;

        const take = Math.min(remaining, available);
        fills.push({ price, quantity: take });
        estimatedQuote += take * price;
        remaining -= take;
    }

    const fillableQuantity = roundQty(quantity - remaining);
    estimatedQuote = roundInr(estimatedQuote);
    const averagePrice = fillableQuantity > 0 ? roundInr(estimatedQuote / fillableQuantity) : 0;

    return { fillableQuantity, estimatedQuote, averagePrice, fills };
}

export function walkBids(symbol: string, quantity: number): MarketWalkResult {
    const firm = ORDERBOOK[symbol];
    if (!firm || quantity <= 0) {
        return { fillableQuantity: 0, estimatedQuote: 0, averagePrice: 0, fills: [] };
    }

    const bidPrices = Object.keys(firm.bids).map(Number).sort((a, b) => b - a);
    let remaining = quantity;
    let estimatedQuote = 0;
    const fills: MarketWalkFill[] = [];

    for (const price of bidPrices) {
        if (remaining <= 0) break;

        const ordersAtPrice = firm.bids[price];
        if (!ordersAtPrice) continue;

        const available = availableAtPrice(ordersAtPrice);
        if (available <= 0) continue;

        const take = Math.min(remaining, available);
        fills.push({ price, quantity: take });
        estimatedQuote += take * price;
        remaining -= take;
    }

    const fillableQuantity = roundQty(quantity - remaining);
    estimatedQuote = roundInr(estimatedQuote);
    const averagePrice = fillableQuantity > 0 ? roundInr(estimatedQuote / fillableQuantity) : 0;

    return { fillableQuantity, estimatedQuote, averagePrice, fills };
}

export function estimateMarketBuy(symbol: string, quantity: number): MarketWalkResult {
    return walkAsks(symbol, roundQty(quantity));
}

export function estimateMarketSell(symbol: string, quantity: number): MarketWalkResult {
    return walkBids(symbol, roundQty(quantity));
}
