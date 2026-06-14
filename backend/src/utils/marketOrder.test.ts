import { describe, expect, test, beforeEach } from "bun:test";
import { ORDERBOOK } from "../state";
import type { MemoryOrder } from "../types/order";
import { estimateMarketBuy, estimateMarketSell, roundInr, walkAsks, walkBids } from "./marketOrder";
import { matchOrder } from "./matchOrder";
import { BALANCES } from "../state";

function makeOrder(partial: Partial<MemoryOrder> & Pick<MemoryOrder, "id" | "userId" | "side" | "symbol">): MemoryOrder {
    return {
        type: "LIMIT",
        quantity: 1,
        filledQuantity: 0,
        status: "PENDING",
        ...partial,
    };
}

function seedBook(symbol: string) {
    ORDERBOOK[symbol] = {
        asks: {
            100: [makeOrder({ id: "ask-1", userId: "seller-1", side: "SELL", symbol, price: 100, quantity: 2 })],
            102: [makeOrder({ id: "ask-2", userId: "seller-2", side: "SELL", symbol, price: 102, quantity: 3 })],
        },
        bids: {
            98: [makeOrder({ id: "bid-1", userId: "buyer-1", side: "BUY", symbol, price: 98, quantity: 4 })],
            95: [makeOrder({ id: "bid-2", userId: "buyer-2", side: "BUY", symbol, price: 95, quantity: 2 })],
        },
    };
}

beforeEach(() => {
    for (const key of Object.keys(ORDERBOOK)) {
        delete ORDERBOOK[key];
    }
    for (const key of Object.keys(BALANCES)) {
        delete BALANCES[key];
    }
});

describe("marketOrder utils", () => {
    test("walkAsks estimates cost across price levels", () => {
        seedBook("SOL");
        const estimate = estimateMarketBuy("SOL", 3);

        expect(estimate.fillableQuantity).toBe(3);
        expect(estimate.estimatedQuote).toBe(roundInr(100 * 2 + 102 * 1));
        expect(estimate.averagePrice).toBe(roundInr(estimate.estimatedQuote / 3));
    });

    test("walkAsks caps fillable quantity to available liquidity", () => {
        seedBook("SOL");
        const estimate = estimateMarketBuy("SOL", 10);

        expect(estimate.fillableQuantity).toBe(5);
        expect(estimate.estimatedQuote).toBe(roundInr(100 * 2 + 102 * 3));
    });

    test("walkBids estimates proceeds for market sell", () => {
        seedBook("SOL");
        const estimate = estimateMarketSell("SOL", 5);

        expect(estimate.fillableQuantity).toBe(5);
        expect(estimate.estimatedQuote).toBe(roundInr(98 * 4 + 95 * 1));
    });

    test("empty book returns zero liquidity", () => {
        ORDERBOOK.SOL = { asks: {}, bids: {} };
        expect(walkAsks("SOL", 1).fillableQuantity).toBe(0);
        expect(walkBids("SOL", 1).fillableQuantity).toBe(0);
    });
});

describe("matchOrder market refunds", () => {
    test("market buy refunds unused locked INR", async () => {
        seedBook("SOL");
        BALANCES.buyer = {
            INR: { available: 0, locked: 250, balanceId: "inr-buyer" },
            SOL: { available: 0, locked: 0, balanceId: "sol-buyer" },
        };
        BALANCES["seller-1"] = {
            INR: { available: 0, locked: 0, balanceId: "inr-s1" },
            SOL: { available: 0, locked: 2, balanceId: "sol-s1" },
        };
        BALANCES["seller-2"] = {
            INR: { available: 0, locked: 0, balanceId: "inr-s2" },
            SOL: { available: 0, locked: 3, balanceId: "sol-s2" },
        };

        const estimate = estimateMarketBuy("SOL", 2);
        const order = makeOrder({
            id: "mkt-buy-1",
            userId: "buyer",
            side: "BUY",
            symbol: "SOL",
            type: "MARKET",
            quantity: 2,
            lockedQuoteAmount: roundInr(estimate.estimatedQuote + 50),
        });

        const result = matchOrder(order, "stock-id");

        expect(result.status).toBe("FILLED");
        expect(result.actualQuote).toBe(roundInr(100 * 2));
        expect(result.refundQuote).toBe(50);
        expect(BALANCES.buyer!.INR!.locked).toBe(0);
        expect(BALANCES.buyer!.INR!.available).toBe(result.refundQuote);
        expect(BALANCES.buyer!.SOL!.available).toBe(2);
    });

    test("market sell refunds unfilled base asset", async () => {
        seedBook("SOL");
        BALANCES.seller = {
            INR: { available: 0, locked: 0, balanceId: "inr-seller" },
            SOL: { available: 0, locked: 7, balanceId: "sol-seller" },
        };
        BALANCES["buyer-1"] = {
            INR: { available: 0, locked: 392, balanceId: "inr-b1" },
            SOL: { available: 0, locked: 0, balanceId: "sol-b1" },
        };
        BALANCES["buyer-2"] = {
            INR: { available: 0, locked: 190, balanceId: "inr-b2" },
            SOL: { available: 0, locked: 0, balanceId: "sol-b2" },
        };

        const order = makeOrder({
            id: "mkt-sell-1",
            userId: "seller",
            side: "SELL",
            symbol: "SOL",
            type: "MARKET",
            quantity: 7,
        });

        const result = matchOrder(order, "stock-id");

        expect(result.status).toBe("FILLED");
        expect(result.filledQuantity).toBe(6);
        expect(BALANCES.seller!.SOL!.locked).toBe(0);
        expect(BALANCES.seller!.SOL!.available).toBe(1);
        expect(BALANCES.seller!.INR!.available).toBe(result.actualQuote);
    });
});
