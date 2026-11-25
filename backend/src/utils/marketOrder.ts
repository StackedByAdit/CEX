import { ORDERBOOK } from "../state";
import { calculateQuote, getAssetScale } from "./precision";

export interface MarketWalkFill {
    price: bigint;
    quantity: bigint;
}

export interface MarketWalkResult {
    fillableQuantity: bigint;
    estimatedQuote: bigint;
    averagePrice: bigint;
    fills: MarketWalkFill[];
}

function availableAtPrice(orders: { quantity: bigint; filledQuantity: bigint }[]): bigint {
    let total = 0n;
    for (const order of orders) {
        total += order.quantity - order.filledQuantity;
    }
    return total;
}

export function walkAsks(symbol: string, quantity: bigint): MarketWalkResult {
    const firm = ORDERBOOK[symbol];
    if (!firm || quantity <= 0n) {
        return { fillableQuantity: 0n, estimatedQuote: 0n, averagePrice: 0n, fills: [] };
    }

    let remaining = quantity;
    let estimatedQuote = 0n;
    const fills: MarketWalkFill[] = [];

    for (const [price, ordersAtPrice] of firm.asks.entries()) {
        if (remaining <= 0n) break;
        if (!ordersAtPrice) continue;

        const available = availableAtPrice(ordersAtPrice);
        if (available <= 0n) continue;

        const take = remaining < available ? remaining : available;
        fills.push({ price, quantity: take });
        const tradeQuote = calculateQuote(take, price, symbol, "up");
        estimatedQuote += tradeQuote;
        remaining -= take;
    }

    const fillableQuantity = quantity - remaining;
    const scale = getAssetScale(symbol);
    const divisor = 10n ** BigInt(scale.decimals);
    const averagePrice = fillableQuantity > 0n
        ? (estimatedQuote * divisor) / fillableQuantity
        : 0n;

    return { fillableQuantity, estimatedQuote, averagePrice, fills };
}

export function walkBids(symbol: string, quantity: bigint): MarketWalkResult {
    const firm = ORDERBOOK[symbol];
    if (!firm || quantity <= 0n) {
        return { fillableQuantity: 0n, estimatedQuote: 0n, averagePrice: 0n, fills: [] };
    }

    let remaining = quantity;
    let estimatedQuote = 0n;
    const fills: MarketWalkFill[] = [];

    for (const [price, ordersAtPrice] of firm.bids.entriesReversed()) {
        if (remaining <= 0n) break;
        if (!ordersAtPrice) continue;

        const available = availableAtPrice(ordersAtPrice);
        if (available <= 0n) continue;

        const take = remaining < available ? remaining : available;
        fills.push({ price, quantity: take });
        const tradeQuote = calculateQuote(take, price, symbol, "down");
        estimatedQuote += tradeQuote;
        remaining -= take;
    }

    const fillableQuantity = quantity - remaining;
    const scale = getAssetScale(symbol);
    const divisor = 10n ** BigInt(scale.decimals);
    const averagePrice = fillableQuantity > 0n
        ? (estimatedQuote * divisor) / fillableQuantity
        : 0n;

    return { fillableQuantity, estimatedQuote, averagePrice, fills };
}

export function estimateMarketBuy(symbol: string, quantity: bigint): MarketWalkResult {
    return walkAsks(symbol, quantity);
}

export function estimateMarketSell(symbol: string, quantity: bigint): MarketWalkResult {
    return walkBids(symbol, quantity);
}
