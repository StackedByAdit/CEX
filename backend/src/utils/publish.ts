import { publisher } from "../redis";
import { BALANCES, ORDERBOOK } from "../state";
import { formatPrice, formatQuantity, getAssetScale, unitsToNumber } from "./precision";

export function formatOrderbookForPublish(symbol: string) {
    const firm = ORDERBOOK[symbol];
    if (!firm) return null;

    const bids: Record<string, number> = {};
    for (const [price, orders] of firm.bids.entriesReversed()) {
        let total = 0n;
        for (const order of orders) {
            total += order.quantity - order.filledQuantity;
        }
        bids[formatPrice(price).toString()] = formatQuantity(total, symbol);
    }

    const asks: Record<string, number> = {};
    for (const [price, orders] of firm.asks.entries()) {
        let total = 0n;
        for (const order of orders) {
            total += order.quantity - order.filledQuantity;
        }
        asks[formatPrice(price).toString()] = formatQuantity(total, symbol);
    }

    return { symbol, bids, asks };
}

export function publishOrderbook(symbol: string) {
    const data = formatOrderbookForPublish(symbol);
    if (!data) return;

    void publisher.publish(`orderbook:${symbol}`, JSON.stringify(data))
        .catch(err => console.error("Orderbook publish error:", err));
}

export function formatBalancesForPublish(userId: string) {
    const userBalances = BALANCES[userId];
    if (!userBalances) return null;

    const balances: Record<string, { available: number; locked: number; balanceId: string }> = {};
    for (const [sym, bal] of Object.entries(userBalances)) {
        const scale = getAssetScale(sym);
        balances[sym] = {
            available: unitsToNumber(bal.available, scale.decimals),
            locked: unitsToNumber(bal.locked, scale.decimals),
            balanceId: bal.balanceId,
        };
    }
    return { userId, balances };
}

export function publishBalance(userId: string) {
    const data = formatBalancesForPublish(userId);
    if (!data) return;

    void publisher.publish("balance:update", JSON.stringify(data))
        .catch(err => console.error("Balance publish error:", err));
}
