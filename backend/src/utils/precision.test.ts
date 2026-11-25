import { describe, expect, test } from "bun:test";
import {
    parseUnits,
    formatUnits,
    unitsToNumber,
    parsePrice,
    formatPrice,
    parseQuantity,
    formatQuantity,
    parseInr,
    formatInr,
    calculateQuote,
    calculateFee,
    getAssetScale,
} from "./precision";
import { matchOrder } from "./matchOrder";
import { BALANCES, ORDERBOOK } from "../state";
import type { MemoryOrder } from "../types/order";
import BTree from "sorted-btree";

function createTree(): BTree<bigint, MemoryOrder[]> {
    return new BTree<bigint, MemoryOrder[]>(undefined, (a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

describe("Precision & Scaling Conversion Suite", () => {
    test("INR parses to paise (2 decimals) with exact round-trip", () => {
        expect(parseInr("101.17")).toBe(10117n);
        expect(parseInr(101.17)).toBe(10117n);
        expect(formatInr(10117n)).toBe(101.17);
        expect(formatUnits(10117n, 2)).toBe("101.17");
    });

    test("SOL parses to lamports (9 decimals) with exact round-trip", () => {
        expect(parseQuantity("0.0001", "SOL")).toBe(100_000n);
        expect(parseQuantity("1.500000000", "SOL")).toBe(1_500_000_000n);
        expect(formatQuantity(100_000n, "SOL")).toBe(0.0001);
        expect(formatUnits(100_000n, 9)).toBe("0.000100000");
    });

    test("AXIS shares parse to 4 decimals (units) with exact round-trip", () => {
        expect(parseQuantity("1842.5000", "AXIS")).toBe(18_425_000n);
        expect(formatQuantity(18_425_000n, "AXIS")).toBe(1842.5);
    });

    test("BTC parses to satoshis (8 decimals)", () => {
        expect(parseUnits("0.00000001", 8)).toBe(1n);
        expect(formatUnits(1n, 8)).toBe("0.00000001");
    });

    test("ETH parses to wei (18 decimals) beyond Number.MAX_SAFE_INTEGER", () => {
        const oneEth = parseUnits("1.0", 18);
        expect(oneEth).toBe(1_000_000_000_000_000_000n);
        // Exceeds 2^53 - 1 (9,007,199,254,740,991)
        expect(oneEth > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
        expect(formatUnits(oneEth, 18)).toBe("1.000000000000000000");
    });

    test("handles scientific notation strings cleanly", () => {
        expect(parseUnits("1e-5", 8)).toBe(1000n);
        expect(parseUnits("2.5e-4", 6)).toBe(250n);
    });

    test("throws descriptive error on malformed or non-numeric input", () => {
        expect(() => parseUnits("abc", 2)).toThrow("Invalid numeric input");
        expect(() => parseUnits("1.2.3", 2)).toThrow("Invalid numeric input");
        expect(() => parseUnits("12a.34", 2)).toThrow("Invalid numeric input");
    });
});

describe("Quote & Fee Calculations with Explicit Rounding", () => {
    test("calculates exact quote for whole numbers", () => {
        // 2 SOL @ 100 INR = 200 INR (20000 paise)
        const qty = parseQuantity(2, "SOL");
        const price = parsePrice(100);
        const quote = calculateQuote(qty, price, "SOL");
        expect(quote).toBe(20000n);
        expect(formatInr(quote)).toBe(200);
    });

    test("calculates quote for partial fill without floating point drift", () => {
        // 0.0001 SOL @ 101.17 INR:
        // Raw: 0.0001 * 101.17 = 0.010117 INR = 1.0117 paise
        const qty = parseQuantity("0.0001", "SOL"); // 100,000 lamports
        const price = parsePrice("101.17");         // 10,117 paise

        // half_up: 1.0117 paise -> 1 paisa (1n)
        expect(calculateQuote(qty, price, "SOL", "half_up")).toBe(1n);
        // up (ceil): 1.0117 paise -> 2 paise (2n)
        expect(calculateQuote(qty, price, "SOL", "up")).toBe(2n);
        // down (floor): 1.0117 paise -> 1 paisa (1n)
        expect(calculateQuote(qty, price, "SOL", "down")).toBe(1n);
    });

    test("calculates basis point fees accurately", () => {
        // 10,000 INR = 1,000,000 paise. 25 bps (0.25%) = 2500 paise = 25 INR
        const quote = parseInr(10000);
        const fee = calculateFee(quote, 25n);
        expect(fee).toBe(2500n);
        expect(formatInr(fee)).toBe(25);
    });
});

describe("Accounting Invariant & Conservation Laws", () => {
    test("trade execution satisfies zero-leakage conservation law", () => {
        ORDERBOOK.SOL = { asks: createTree(), bids: createTree() };

        const price = parsePrice(105);
        const sellQty = parseQuantity(5, "SOL");
        const buyQty = parseQuantity(3, "SOL");

        const restingSell: MemoryOrder = {
            id: "sell-order",
            userId: "seller",
            side: "SELL",
            symbol: "SOL",
            type: "LIMIT",
            price,
            quantity: sellQty,
            filledQuantity: 0n,
            status: "PENDING",
        };
        ORDERBOOK.SOL.asks.set(price, [restingSell]);

        const buyerInitialInr = parseInr(500); // 500 INR
        const sellerInitialSol = sellQty;

        BALANCES.buyer = {
            INR: { available: 0n, locked: buyerInitialInr, balanceId: "b-inr" },
            SOL: { available: 0n, locked: 0n, balanceId: "b-sol" },
        };
        BALANCES.seller = {
            INR: { available: 0n, locked: 0n, balanceId: "s-inr" },
            SOL: { available: 0n, locked: sellerInitialSol, balanceId: "s-sol" },
        };

        const incomingBuy: MemoryOrder = {
            id: "buy-order",
            userId: "buyer",
            side: "BUY",
            symbol: "SOL",
            type: "LIMIT",
            price,
            quantity: buyQty,
            filledQuantity: 0n,
            status: "PENDING",
        };

        const result = matchOrder(incomingBuy, "stock-sol");

        expect(result.status).toBe("FILLED");
        expect(result.filledQuantity).toBe(buyQty);

        // Conservation of Quote (INR):
        // Total INR in system before = 500 INR
        // Total INR in system after:
        const buyerTotalInr = BALANCES.buyer!.INR!.available + BALANCES.buyer!.INR!.locked;
        const sellerTotalInr = BALANCES.seller!.INR!.available + BALANCES.seller!.INR!.locked;
        expect(buyerTotalInr + sellerTotalInr).toBe(buyerInitialInr);

        // Conservation of Base Asset (SOL):
        // Total SOL in system before = 5 SOL
        // Total SOL in system after:
        const buyerTotalSol = BALANCES.buyer!.SOL!.available + BALANCES.buyer!.SOL!.locked;
        const sellerTotalSol = BALANCES.seller!.SOL!.available + BALANCES.seller!.SOL!.locked;
        expect(buyerTotalSol + sellerTotalSol).toBe(sellerInitialSol);

        // Exact settlement check:
        // 3 SOL @ 105 INR = 315 INR (31,500 paise)
        const expectedQuote = parseInr(3 * 105);
        expect(result.actualQuote).toBe(expectedQuote);
        expect(BALANCES.seller!.INR!.available).toBe(expectedQuote);
        expect(BALANCES.buyer!.INR!.locked).toBe(buyerInitialInr - expectedQuote);
        expect(BALANCES.buyer!.SOL!.available).toBe(buyQty);
    });

    test("100 sequential micro-partial fills maintain exact total balance with zero leakage", () => {
        ORDERBOOK.SOL = { asks: createTree(), bids: createTree() };

        const price = parsePrice("101.17");
        const singleFillQty = parseQuantity("0.01", "SOL"); // 10,000,000 lamports
        const totalFills = 100;
        const totalSellQty = singleFillQty * BigInt(totalFills); // 1.0 SOL

        const restingSell: MemoryOrder = {
            id: "seller-large",
            userId: "seller",
            side: "SELL",
            symbol: "SOL",
            type: "LIMIT",
            price,
            quantity: totalSellQty,
            filledQuantity: 0n,
            status: "PENDING",
        };
        ORDERBOOK.SOL.asks.set(price, [restingSell]);

        const quotePerFill = calculateQuote(singleFillQty, price, "SOL", "half_up");
        const totalExpectedQuote = quotePerFill * BigInt(totalFills);

        BALANCES.buyer = {
            INR: { available: 0n, locked: totalExpectedQuote, balanceId: "b-inr" },
            SOL: { available: 0n, locked: 0n, balanceId: "b-sol" },
        };
        BALANCES.seller = {
            INR: { available: 0n, locked: 0n, balanceId: "s-inr" },
            SOL: { available: 0n, locked: totalSellQty, balanceId: "s-sol" },
        };

        for (let i = 0; i < totalFills; i++) {
            const buyOrder: MemoryOrder = {
                id: `buy-${i}`,
                userId: "buyer",
                side: "BUY",
                symbol: "SOL",
                type: "LIMIT",
                price,
                quantity: singleFillQty,
                filledQuantity: 0n,
                status: "PENDING",
            };
            const matchRes = matchOrder(buyOrder, "stock-sol");
            expect(matchRes.status).toBe("FILLED");
        }

        // Verify seller received exact totalQuote without 1 paisa discrepancy
        expect(BALANCES.seller!.INR!.available).toBe(totalExpectedQuote);
        expect(BALANCES.buyer!.INR!.locked).toBe(0n);
        expect(BALANCES.buyer!.SOL!.available).toBe(totalSellQty);
        expect(BALANCES.seller!.SOL!.locked).toBe(0n);
    });
});
