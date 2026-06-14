import { publisher } from "../redis";
import { BALANCES, ORDERBOOK } from "../state";

export function publishOrderbook(symbol: string) {
    const firm = ORDERBOOK[symbol];
    if (!firm) return;

    void publisher.publish(`orderbook:${symbol}`, JSON.stringify({
        symbol,
        bids: firm.bids,
        asks: firm.asks,
    })).catch(err => console.error("Orderbook publish error:", err));
}

export function publishBalance(userId: string) {
    const balances = BALANCES[userId];
    if (!balances) return;

    void publisher.publish("balance:update", JSON.stringify({
        userId,
        balances,
    })).catch(err => console.error("Balance publish error:", err));
}
