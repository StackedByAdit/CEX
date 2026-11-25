import { describe, expect, test, beforeEach } from "bun:test";
import { ORDERBOOK, BALANCES } from "../state";
import type { MemoryOrder } from "../types/order";
import { estimateMarketBuy, estimateMarketSell, walkAsks, walkBids } from "./marketOrder";
import { matchOrder } from "./matchOrder";
import { parsePrice, parseQuantity, parseInr, formatInr, formatQuantity, calculateQuote } from "./precision";
import BTree from "sorted-btree";

function makeOrder(partial: Partial<MemoryOrder> & Pick<MemoryOrder, "id" | "userId" | "side" | "symbol">): MemoryOrder {
    return {
        type: "LIMIT",
        quantity: parseQuantity(1, partial.symbol),
        filledQuantity: 0n,
        status: "PENDING",
        ...partial,
    };
}

function createTree(): BTree<bigint, MemoryOrder[]> {
    return new BTree<bigint, MemoryOrder[]>(undefined, (a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function seedBook(symbol: string) {
    const asks = createTree();
    asks.set(parsePrice(100), [
        makeOrder({ id: "ask-1", userId: "seller-1", side: "SELL", symbol, price: parsePrice(100), quantity: parseQuantity(2, symbol) })
    ]);
    asks.set(parsePrice(102), [
        makeOrder({ id: "ask-2", userId: "seller-2", side: "SELL", symbol, price: parsePrice(102), quantity: parseQuantity(3, symbol) })
    ]);

    const bids = createTree();
    bids.set(parsePrice(98), [
        makeOrder({ id: "bid-1", userId: "buyer-1", side: "BUY", symbol, price: parsePrice(98), quantity: parseQuantity(4, symbol) })
    ]);
    bids.set(parsePrice(95), [
        makeOrder({ id: "bid-2", userId: "buyer-2", side: "BUY", symbol, price: parsePrice(95), quantity: parseQuantity(2, symbol) })
    ]);

    ORDERBOOK[symbol] = { asks, bids };
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
        const qty = parseQuantity(3, "SOL");
        const estimate = estimateMarketBuy("SOL", qty);

        expect(estimate.fillableQuantity).toBe(qty);
        // 2 SOL @ 100 INR + 1 SOL @ 102 INR = 302 INR (30200 paise)
        const expectedQuote = parseInr(100 * 2 + 102 * 1);
        expect(estimate.estimatedQuote).toBe(expectedQuote);
    });

    test("walkAsks caps fillable quantity to available liquidity", () => {
        seedBook("SOL");
        const estimate = estimateMarketBuy("SOL", parseQuantity(10, "SOL"));

        expect(estimate.fillableQuantity).toBe(parseQuantity(5, "SOL"));
        expect(estimate.estimatedQuote).toBe(parseInr(100 * 2 + 102 * 3));
    });

    test("walkBids estimates proceeds for market sell", () => {
        seedBook("SOL");
        const estimate = estimateMarketSell("SOL", parseQuantity(5, "SOL"));

        expect(estimate.fillableQuantity).toBe(parseQuantity(5, "SOL"));
        // 4 SOL @ 98 INR + 1 SOL @ 95 INR = 392 + 95 = 487 INR (48700 paise)
        expect(estimate.estimatedQuote).toBe(parseInr(98 * 4 + 95 * 1));
    });

    test("empty book returns zero liquidity", () => {
        ORDERBOOK.SOL = { asks: createTree(), bids: createTree() };
        expect(walkAsks("SOL", parseQuantity(1, "SOL")).fillableQuantity).toBe(0n);
        expect(walkBids("SOL", parseQuantity(1, "SOL")).fillableQuantity).toBe(0n);
    });
});

describe("matchOrder market refunds", () => {
    test("market buy refunds unused locked INR", async () => {
        seedBook("SOL");
        BALANCES.buyer = {
            INR: { available: 0n, locked: parseInr(250), balanceId: "inr-buyer" },
            SOL: { available: 0n, locked: 0n, balanceId: "sol-buyer" },
        };
        BALANCES["seller-1"] = {
            INR: { available: 0n, locked: 0n, balanceId: "inr-s1" },
            SOL: { available: 0n, locked: parseQuantity(2, "SOL"), balanceId: "sol-s1" },
        };
        BALANCES["seller-2"] = {
            INR: { available: 0n, locked: 0n, balanceId: "inr-s2" },
            SOL: { available: 0n, locked: parseQuantity(3, "SOL"), balanceId: "sol-s2" },
        };

        const estimate = estimateMarketBuy("SOL", parseQuantity(2, "SOL"));
        const order = makeOrder({
            id: "mkt-buy-1",
            userId: "buyer",
            side: "BUY",
            symbol: "SOL",
            type: "MARKET",
            quantity: parseQuantity(2, "SOL"),
            lockedQuoteAmount: estimate.estimatedQuote + parseInr(50),
        });

        const result = matchOrder(order, "stock-id");

        expect(result.status).toBe("FILLED");
        expect(result.actualQuote).toBe(parseInr(100 * 2));
        expect(result.refundQuote).toBe(parseInr(50));
        expect(BALANCES.buyer!.INR!.locked).toBe(0n);
        expect(BALANCES.buyer!.INR!.available).toBe(result.refundQuote);
        expect(BALANCES.buyer!.SOL!.available).toBe(parseQuantity(2, "SOL"));
    });

    test("market sell refunds unfilled base asset", async () => {
        seedBook("SOL");
        BALANCES.seller = {
            INR: { available: 0n, locked: 0n, balanceId: "inr-seller" },
            SOL: { available: 0n, locked: parseQuantity(7, "SOL"), balanceId: "sol-seller" },
        };
        BALANCES["buyer-1"] = {
            INR: { available: 0n, locked: parseInr(392), balanceId: "inr-b1" },
            SOL: { available: 0n, locked: 0n, balanceId: "sol-b1" },
        };
        BALANCES["buyer-2"] = {
            INR: { available: 0n, locked: parseInr(190), balanceId: "inr-b2" },
            SOL: { available: 0n, locked: 0n, balanceId: "sol-b2" },
        };

        const order = makeOrder({
            id: "mkt-sell-1",
            userId: "seller",
            side: "SELL",
            symbol: "SOL",
            type: "MARKET",
            quantity: parseQuantity(7, "SOL"),
        });

        const result = matchOrder(order, "stock-id");

        expect(result.status).toBe("FILLED");
        expect(result.filledQuantity).toBe(parseQuantity(6, "SOL"));
        expect(BALANCES.seller!.SOL!.locked).toBe(0n);
        expect(BALANCES.seller!.SOL!.available).toBe(parseQuantity(1, "SOL"));
        expect(BALANCES.seller!.INR!.available).toBe(result.actualQuote);
    });

    test("limit buy fully fills resting limit sell", () => {
        const asks = createTree();
        const restingSell = makeOrder({
            id: "ask-1",
            userId: "seller-1",
            side: "SELL",
            symbol: "SOL",
            price: parsePrice(102),
            quantity: parseQuantity(111, "SOL")
        });
        asks.set(parsePrice(102), [restingSell]);
        ORDERBOOK.SOL = {
            asks,
            bids: createTree(),
        };
        BALANCES.buyer = {
            INR: { available: 0n, locked: parseInr(12000), balanceId: "inr-buyer" },
            SOL: { available: 0n, locked: 0n, balanceId: "sol-buyer" },
        };
        BALANCES["seller-1"] = {
            INR: { available: 0n, locked: 0n, balanceId: "inr-s1" },
            SOL: { available: 0n, locked: parseQuantity(111, "SOL"), balanceId: "sol-s1" },
        };

        const buyOrder = makeOrder({
            id: "buy-1",
            userId: "buyer",
            side: "BUY",
            symbol: "SOL",
            price: parsePrice(111),
            quantity: parseQuantity(111, "SOL"),
        });

        const result = matchOrder(buyOrder, "stock-id");

        expect(result.status).toBe("FILLED");
        expect(result.filledQuantity).toBe(parseQuantity(111, "SOL"));
        expect(restingSell.status).toBe("FILLED");
        expect(restingSell.filledQuantity).toBe(parseQuantity(111, "SOL"));
        expect(ORDERBOOK.SOL.asks.get(parsePrice(102))).toBeUndefined();
    });

    test("limit buy with price improvement refunds surplus quote to available balance", () => {
        const asks = createTree();
        const restingSell = makeOrder({
            id: "ask-p1",
            userId: "seller-p1",
            side: "SELL",
            symbol: "SOL",
            price: parsePrice(100),
            quantity: parseQuantity(10, "SOL"),
        });
        asks.set(parsePrice(100), [restingSell]);
        ORDERBOOK.SOL = { asks, bids: createTree() };

        // Buyer locks 105 INR * 10 = 1050 INR
        const initialLocked = parseInr(1050);
        BALANCES["buyer-p1"] = {
            INR: { available: 0n, locked: initialLocked, balanceId: "inr-bp1" },
            SOL: { available: 0n, locked: 0n, balanceId: "sol-bp1" },
        };
        BALANCES["seller-p1"] = {
            INR: { available: 0n, locked: 0n, balanceId: "inr-sp1" },
            SOL: { available: 0n, locked: parseQuantity(10, "SOL"), balanceId: "sol-sp1" },
        };

        const limitBuy = makeOrder({
            id: "buy-p1",
            userId: "buyer-p1",
            side: "BUY",
            symbol: "SOL",
            price: parsePrice(105),
            quantity: parseQuantity(10, "SOL"),
            lockedQuoteAmount: initialLocked,
        });

        const result = matchOrder(limitBuy, "stock-id");

        expect(result.status).toBe("FILLED");
        expect(result.actualQuote).toBe(parseInr(1000)); // 10 * 100 = 1000 INR
        expect(result.refundQuote).toBe(parseInr(50));   // 50 INR savings refunded
        expect(BALANCES["buyer-p1"]!.INR!.locked).toBe(0n);
        expect(BALANCES["buyer-p1"]!.INR!.available).toBe(parseInr(50));
        expect(BALANCES["buyer-p1"]!.SOL!.available).toBe(parseQuantity(10, "SOL"));
    });

    test("limit buy with partial fill refunds surplus on matched part and retains exact lock on resting part", () => {
        const asks = createTree();
        const restingSell = makeOrder({
            id: "ask-part",
            userId: "seller-part",
            side: "SELL",
            symbol: "SOL",
            price: parsePrice(100),
            quantity: parseQuantity(4, "SOL"), // only 4 available
        });
        asks.set(parsePrice(100), [restingSell]);
        ORDERBOOK.SOL = { asks, bids: createTree() };

        // Buyer wants 10 SOL @ 105 INR (locks 1050 INR)
        const initialLocked = parseInr(1050);
        BALANCES["buyer-part"] = {
            INR: { available: 0n, locked: initialLocked, balanceId: "inr-bpart" },
            SOL: { available: 0n, locked: 0n, balanceId: "sol-bpart" },
        };
        BALANCES["seller-part"] = {
            INR: { available: 0n, locked: 0n, balanceId: "inr-spart" },
            SOL: { available: 0n, locked: parseQuantity(4, "SOL"), balanceId: "sol-spart" },
        };

        const limitBuy = makeOrder({
            id: "buy-part",
            userId: "buyer-part",
            side: "BUY",
            symbol: "SOL",
            price: parsePrice(105),
            quantity: parseQuantity(10, "SOL"),
            lockedQuoteAmount: initialLocked,
        });

        const result = matchOrder(limitBuy, "stock-id");

        expect(result.status).toBe("PARTIALLY_FILLED");
        expect(result.filledQuantity).toBe(parseQuantity(4, "SOL"));
        expect(result.actualQuote).toBe(parseInr(400)); // 4 * 100 = 400 INR
        // 4 units @ 100 INR instead of 105 INR -> 20 INR price improvement refund
        expect(result.refundQuote).toBe(parseInr(20));
        expect(BALANCES["buyer-part"]!.INR!.available).toBe(parseInr(20));
        // Remaining 6 SOL @ 105 INR rests on book with exactly 630 INR locked
        expect(BALANCES["buyer-part"]!.INR!.locked).toBe(parseInr(630));
        expect(limitBuy.lockedQuoteAmount).toBe(parseInr(630));
        // Rested on bid side of book
        expect(ORDERBOOK.SOL.bids.get(parsePrice(105))?.length).toBe(1);
    });
});
