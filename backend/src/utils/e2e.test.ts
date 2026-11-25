import { describe, expect, test, beforeEach } from "bun:test";
import { ORDERBOOK, BALANCES, ORDERS } from "../state";
import type { MemoryOrder } from "../types/order";
import { serializeOrderForQueue, deserializeOrderFromQueue } from "../types/order";
import { matchOrder, serializeMatchResultToJson } from "./matchOrder";
import { executeOrder } from "../worker";
import { estimateMarketBuy, estimateMarketSell } from "./marketOrder";
import {
    parsePrice,
    parseQuantity,
    parseInr,
    formatPrice,
    formatQuantity,
    formatInr,
    calculateQuote,
    getAssetScale,
    unitsToNumber,
} from "./precision";
import { formatOrderbookForPublish, formatBalancesForPublish } from "./publish";
import { lockAndQueueOrder } from "./orderPlacement";
import { STOCK_BY_SYMBOL } from "../state";
import BTree from "sorted-btree";

function createTree(): BTree<bigint, MemoryOrder[]> {
    return new BTree<bigint, MemoryOrder[]>(undefined, (a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

beforeEach(() => {
    for (const key of Object.keys(ORDERBOOK)) {
        delete ORDERBOOK[key];
    }
    for (const key of Object.keys(BALANCES)) {
        delete BALANCES[key];
    }
    ORDERS.length = 0;
});

describe("End-to-End Precision & System Integration", () => {
    test("1. Redis Queue Packet Serialization/Deserialization Round-Trip", () => {
        const originalOrder: MemoryOrder = {
            id: "ord-test-101",
            userId: "usr-42",
            side: "BUY",
            type: "LIMIT",
            symbol: "SOL",
            price: parsePrice(101.17),
            quantity: parseQuantity(2.5, "SOL"),
            filledQuantity: 0n,
            status: "PENDING",
            lockedQuoteAmount: 25293n,
        };

        const serialized = serializeOrderForQueue(originalOrder, "stock-sol-id");
        expect(typeof serialized).toBe("string");
        const parsedJson = JSON.parse(serialized);
        expect(parsedJson.price).toBe("10117");
        expect(parsedJson.quantity).toBe("2500000000");
        expect(parsedJson.lockedQuoteAmount).toBe("25293");

        const { order: restored, stockId } = deserializeOrderFromQueue(serialized);
        expect(stockId).toBe("stock-sol-id");
        expect(restored.id).toBe(originalOrder.id);
        expect(restored.userId).toBe(originalOrder.userId);
        expect(restored.side).toBe("BUY");
        expect(restored.price).toBe(10117n);
        expect(typeof restored.price).toBe("bigint");
        expect(restored.quantity).toBe(2500000000n);
        expect(typeof restored.quantity).toBe("bigint");
        expect(restored.filledQuantity).toBe(0n);
        expect(restored.lockedQuoteAmount).toBe(25293n);
    });

    test("2. In-Memory BTree Price-Time Priority with BigInt Keys", () => {
        const asks = createTree();
        const bids = createTree();
        ORDERBOOK.SOL = { asks, bids };

        const p105 = parsePrice(105.00);
        const p101_50 = parsePrice(101.50);
        const p103_25 = parsePrice(103.25);

        asks.set(p105, [{
            id: "ask-3",
            userId: "s3",
            side: "SELL",
            type: "LIMIT",
            symbol: "SOL",
            price: p105,
            quantity: parseQuantity(1, "SOL"),
            filledQuantity: 0n,
            status: "PENDING",
        }]);
        asks.set(p101_50, [{
            id: "ask-1",
            userId: "s1",
            side: "SELL",
            type: "LIMIT",
            symbol: "SOL",
            price: p101_50,
            quantity: parseQuantity(1, "SOL"),
            filledQuantity: 0n,
            status: "PENDING",
        }]);
        asks.set(p103_25, [{
            id: "ask-2",
            userId: "s2",
            side: "SELL",
            type: "LIMIT",
            symbol: "SOL",
            price: p103_25,
            quantity: parseQuantity(1, "SOL"),
            filledQuantity: 0n,
            status: "PENDING",
        }]);

        const askPrices = Array.from(asks.keys());
        expect(askPrices[0]).toBe(p101_50);
        expect(askPrices[1]).toBe(p103_25);
        expect(askPrices[2]).toBe(p105);

        const p98 = parsePrice(98.00);
        const p100_50 = parsePrice(100.50);
        const p99_25 = parsePrice(99.25);

        bids.set(p98, [{ id: "b1", userId: "u1", side: "BUY", type: "LIMIT", symbol: "SOL", price: p98, quantity: 1n, filledQuantity: 0n, status: "PENDING" }]);
        bids.set(p100_50, [{ id: "b2", userId: "u2", side: "BUY", type: "LIMIT", symbol: "SOL", price: p100_50, quantity: 1n, filledQuantity: 0n, status: "PENDING" }]);
        bids.set(p99_25, [{ id: "b3", userId: "u3", side: "BUY", type: "LIMIT", symbol: "SOL", price: p99_25, quantity: 1n, filledQuantity: 0n, status: "PENDING" }]);

        const bidPricesDescending = Array.from(bids.entriesReversed()).map(([p]) => p);
        expect(bidPricesDescending[0]).toBe(p100_50);
        expect(bidPricesDescending[1]).toBe(p99_25);
        expect(bidPricesDescending[2]).toBe(p98);
    });

    test("3. Matching Engine Strict Zero-Leakage Conservation Law Across Partial Fills", () => {
        const userA = "user-alice";
        const userB = "user-bob";

        const initialAliceInr = parseInr(100000.00);
        const initialAliceSol = 0n;
        const initialBobInr = 0n;
        const initialBobSol = parseQuantity(100.0, "SOL");

        BALANCES[userA] = {
            INR: { available: initialAliceInr, locked: 0n, balanceId: "bal-alice-inr" },
            SOL: { available: initialAliceSol, locked: 0n, balanceId: "bal-alice-sol" },
        };
        BALANCES[userB] = {
            INR: { available: initialBobInr, locked: 0n, balanceId: "bal-bob-inr" },
            SOL: { available: initialBobSol, locked: 0n, balanceId: "bal-bob-sol" },
        };

        ORDERBOOK.SOL = {
            asks: createTree(),
            bids: createTree(),
        };

        const bobSellQty = parseQuantity(10.5, "SOL");
        const bobSellPrice = parsePrice(101.25);
        BALANCES[userB].SOL!.available -= bobSellQty;
        BALANCES[userB].SOL!.locked += bobSellQty;

        const bobOrder: MemoryOrder = {
            id: "bob-sell-1",
            userId: userB,
            side: "SELL",
            type: "LIMIT",
            symbol: "SOL",
            price: bobSellPrice,
            quantity: bobSellQty,
            filledQuantity: 0n,
            status: "PENDING",
        };
        ORDERBOOK.SOL.asks.set(bobSellPrice, [bobOrder]);

        const aliceBuyQty = parseQuantity(3.25, "SOL");
        const estimate = estimateMarketBuy("SOL", aliceBuyQty);
        expect(estimate.fillableQuantity).toBe(aliceBuyQty);

        BALANCES[userA].INR!.available -= estimate.estimatedQuote;
        BALANCES[userA].INR!.locked += estimate.estimatedQuote;

        const aliceOrder: MemoryOrder = {
            id: "alice-buy-1",
            userId: userA,
            side: "BUY",
            type: "MARKET",
            symbol: "SOL",
            quantity: aliceBuyQty,
            filledQuantity: 0n,
            status: "PENDING",
            lockedQuoteAmount: estimate.estimatedQuote,
        };

        const result = matchOrder(aliceOrder, "stock-sol");

        expect(result.status).toBe("FILLED");
        expect(result.filledQuantity).toBe(aliceBuyQty);
        expect(result.fills.length).toBe(1);
        expect(result.fills[0]!.price).toBe(bobSellPrice);
        expect(result.fills[0]!.quantity).toBe(aliceBuyQty);

        expect(bobOrder.status).toBe("PARTIALLY_FILLED");
        expect(bobOrder.filledQuantity).toBe(aliceBuyQty);
        expect(bobOrder.quantity - bobOrder.filledQuantity).toBe(parseQuantity(7.25, "SOL"));

        expect(BALANCES[userB].SOL!.locked).toBe(parseQuantity(7.25, "SOL"));
        expect(BALANCES[userB].INR!.available).toBe(result.actualQuote);

        expect(BALANCES[userA].SOL!.available).toBe(aliceBuyQty);
        expect(BALANCES[userA].INR!.locked).toBe(0n);

        const totalInrAfter =
            BALANCES[userA].INR!.available + BALANCES[userA].INR!.locked +
            BALANCES[userB].INR!.available + BALANCES[userB].INR!.locked;
        const totalSolAfter =
            BALANCES[userA].SOL!.available + BALANCES[userA].SOL!.locked +
            BALANCES[userB].SOL!.available + BALANCES[userB].SOL!.locked;

        expect(totalInrAfter).toBe(initialAliceInr + initialBobInr);
        expect(totalSolAfter).toBe(initialAliceSol + initialBobSol);
    });

    test("4. Safe JSON Serialization for WebSocket and Redis Responses", () => {
        const dummyResult = {
            status: "FILLED" as const,
            filledQuantity: parseQuantity(1.5, "SOL"),
            fills: [{ price: parsePrice(101.50), quantity: parseQuantity(1.5, "SOL") }],
            fillRecords: [],
            counterPartyOrders: [],
            counterPartyUserIds: [],
            actualQuote: parseInr(152.25),
            refundQuote: 0n,
        };

        const jsonResult = serializeMatchResultToJson(dummyResult, "SOL");
        let serializedStr = "";
        expect(() => {
            serializedStr = JSON.stringify(jsonResult);
        }).not.toThrow();

        const parsed = JSON.parse(serializedStr);
        expect(parsed.filledQuantity).toBe(1.5);
        expect(parsed.fills[0].price).toBe(101.5);
        expect(parsed.fills[0].quantity).toBe(1.5);
        expect(parsed.actualQuote).toBe(152.25);
    });

    test("5. WebSocket Snapshots Output Valid Numbers (No Unhandled BigInts)", () => {
        const asks = createTree();
        const bids = createTree();
        ORDERBOOK.ETH = { asks, bids };

        asks.set(parsePrice(250000.00), [{
            id: "eth-ask-1",
            userId: "eth-seller",
            side: "SELL",
            type: "LIMIT",
            symbol: "ETH",
            price: parsePrice(250000.00),
            quantity: parseQuantity(0.5, "ETH"),
            filledQuantity: 0n,
            status: "PENDING",
        }]);

        BALANCES["eth-seller"] = {
            INR: { available: parseInr(50000.00), locked: 0n, balanceId: "b-inr" },
            ETH: { available: 0n, locked: parseQuantity(0.5, "ETH"), balanceId: "b-eth" },
        };

        const obSnapshot = formatOrderbookForPublish("ETH");
        expect(obSnapshot).toBeDefined();
        expect(typeof obSnapshot!.asks["250000"]).toBe("number");
        expect(obSnapshot!.asks["250000"]).toBe(0.5);

        const balSnapshot = formatBalancesForPublish("eth-seller");
        expect(balSnapshot).toBeDefined();
        expect(balSnapshot!.balances["INR"]?.available).toBe(50000);
        expect(balSnapshot!.balances["ETH"]?.locked).toBe(0.5);

        expect(() => JSON.stringify(obSnapshot)).not.toThrow();
        expect(() => JSON.stringify(balSnapshot)).not.toThrow();
    });

    test("6. Large Number Safety Beyond Number.MAX_SAFE_INTEGER with ETH (18 Decimals)", () => {
        const largeEth = parseQuantity("1000.000000000000000001", "ETH");
        expect(largeEth > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);

        const price = parsePrice(250000.00);
        const quotePaise = calculateQuote(largeEth, price, "ETH", "half_up");

        expect(quotePaise).toBe(25000000000n);
    });

    test("7. Live Worker & Request-Reply Pipeline Integration", async () => {
        const testOrderId = `ord-redis-test-${Date.now()}`;
        const userSeller = "seller-redis-user";
        const userBuyer = "buyer-redis-user";

        BALANCES[userSeller] = {
            INR: { available: 0n, locked: 0n, balanceId: "bal-s-inr" },
            SOL: { available: 0n, locked: parseQuantity(5, "SOL"), balanceId: "bal-s-sol" },
        };
        BALANCES[userBuyer] = {
            INR: { available: parseInr(1000), locked: parseInr(202.34), balanceId: "bal-b-inr" },
            SOL: { available: 0n, locked: 0n, balanceId: "bal-b-sol" },
        };

        ORDERBOOK.SOL = {
            asks: createTree(),
            bids: createTree(),
        };

        const makerOrder: MemoryOrder = {
            id: `maker-${Date.now()}`,
            userId: userSeller,
            side: "SELL",
            type: "LIMIT",
            symbol: "SOL",
            price: parsePrice(101.17),
            quantity: parseQuantity(5, "SOL"),
            filledQuantity: 0n,
            status: "PENDING",
        };
        ORDERBOOK.SOL.asks.set(parsePrice(101.17), [makerOrder]);

        const takerOrder: MemoryOrder = {
            id: testOrderId,
            userId: userBuyer,
            side: "BUY",
            type: "MARKET",
            symbol: "SOL",
            quantity: parseQuantity(2, "SOL"),
            filledQuantity: 0n,
            status: "PENDING",
            lockedQuoteAmount: parseInr(202.34),
        };

        const queuePayload = serializeOrderForQueue(takerOrder, "stock-sol-id");
        expect(typeof queuePayload).toBe("string");

        const { redisClient, resultClient } = await import("../redis");

        let isRedisOnline = false;
        try {
            const pong = await Promise.race([
                redisClient.ping(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 200)),
            ]);
            isRedisOnline = pong === "PONG";
        } catch {
            isRedisOnline = false;
        }

        let clientResult: any;

        if (isRedisOnline) {
            await redisClient.lpush("queue:test-orders", queuePayload);
            const popped = await redisClient.brpop("queue:test-orders", 2);
            expect(popped).not.toBeNull();
            const { order: workerOrder, stockId } = deserializeOrderFromQueue(popped![1]);

            const matchResult = await executeOrder(workerOrder, stockId);
            expect(matchResult.status).toBe("FILLED");
            expect(matchResult.filledQuantity).toBe(parseQuantity(2, "SOL"));

            const jsonResult = serializeMatchResultToJson(matchResult, workerOrder.symbol);
            await redisClient.lpush(`result:${testOrderId}`, JSON.stringify(jsonResult));

            const rawResult = await resultClient.brpop(`result:${testOrderId}`, 2);
            expect(rawResult).not.toBeNull();
            clientResult = JSON.parse(rawResult![1]);
        } else {
            const { order: workerOrder, stockId } = deserializeOrderFromQueue(queuePayload);
            const matchResult = await executeOrder(workerOrder, stockId);
            expect(matchResult.status).toBe("FILLED");
            expect(matchResult.filledQuantity).toBe(parseQuantity(2, "SOL"));

            const jsonResult = serializeMatchResultToJson(matchResult, workerOrder.symbol);
            clientResult = JSON.parse(JSON.stringify(jsonResult));
        }

        expect(clientResult.status).toBe("FILLED");
        expect(clientResult.filledQuantity).toBe(2);
        expect(clientResult.actualQuote).toBe(202.34);
        expect(clientResult.fills[0].price).toBe(101.17);
        expect(clientResult.fills[0].quantity).toBe(2);

        expect(makerOrder.filledQuantity).toBe(parseQuantity(2, "SOL"));
        expect(makerOrder.status).toBe("PARTIALLY_FILLED");

        expect(BALANCES[userBuyer].SOL!.available).toBe(parseQuantity(2, "SOL"));
        expect(BALANCES[userSeller].INR!.available).toBe(parseInr(202.34));
    });

    test("8. lockAndQueueOrder Ingress: validation, pre-locking, and queue delivery", async () => {
        STOCK_BY_SYMBOL.SOL = { id: "stock-sol-id" };

        const testUser = "usr-queue-tester";
        BALANCES[testUser] = {
            INR: { available: parseInr(500.00), locked: 0n, balanceId: "" },
            SOL: { available: parseQuantity(10, "SOL"), locked: 0n, balanceId: "" },
        };

        expect(lockAndQueueOrder(testUser, {
            side: "BUY",
            type: "LIMIT",
            symbol: "SOL",
            price: 600,
            quantity: 1,
        })).rejects.toThrow("INSUFFICIENT INR");

        expect(lockAndQueueOrder(testUser, {
            side: "BUY",
            type: "LIMIT",
            symbol: "SOL",
            price: 100,
            quantity: 0,
        })).rejects.toThrow("Quantity must be greater than zero");

        expect(lockAndQueueOrder(testUser, {
            side: "BUY",
            type: "LIMIT",
            symbol: "SOL",
            quantity: 1,
        })).rejects.toThrow("Price required for LIMIT order");

        const result = await lockAndQueueOrder(testUser, {
            side: "BUY",
            type: "LIMIT",
            symbol: "SOL",
            price: 100,
            quantity: 2,
        });

        expect(result.orderId).toBeDefined();
        expect(result.orderQuantity).toBe(parseQuantity(2, "SOL"));
        expect(result.orderPrice).toBe(parsePrice(100));
        expect(result.lockedQuoteAmount).toBe(parseInr(200));

        expect(BALANCES[testUser].INR!.available).toBe(parseInr(300));
        expect(BALANCES[testUser].INR!.locked).toBe(parseInr(200));
    });

    test("9. Zero-Auth WebSocket Order Handshake: accepts order with verified user context", async () => {
        STOCK_BY_SYMBOL.SOL = { id: "stock-sol-id" };

        const wsUser = "usr-ws-trader";
        BALANCES[wsUser] = {
            INR: { available: parseInr(1000.00), locked: 0n, balanceId: "" },
            SOL: { available: parseQuantity(5, "SOL"), locked: 0n, balanceId: "" },
        };

        const wsMessage = {
            type: "PLACE_ORDER",
            requestId: "req-ws-42",
            side: "BUY" as const,
            orderType: "LIMIT" as const,
            symbol: "SOL",
            price: 101.50,
            quantity: 3,
        };

        const { orderId, currOrder, estimatedQuoteNum } = await lockAndQueueOrder(wsUser, {
            side: wsMessage.side,
            type: wsMessage.orderType,
            symbol: wsMessage.symbol,
            price: wsMessage.price,
            quantity: wsMessage.quantity,
        });

        expect(orderId).toBeDefined();
        expect(currOrder.userId).toBe(wsUser);
        expect(currOrder.status).toBe("PENDING");
        expect(estimatedQuoteNum).toBe(304.5);

        expect(BALANCES[wsUser].INR!.available).toBe(parseInr(1000 - 304.5));
        expect(BALANCES[wsUser].INR!.locked).toBe(parseInr(304.5));
    });
});
