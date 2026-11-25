import { describe, expect, test, mock } from "bun:test";
import { queueOrderUpsert, queueFillsInsert, queueBalanceUpdate, flushDbBuffer } from "./dbBuffer";
import { prisma } from "../prisma";
import type { MemoryOrder } from "../types/order";
import { parsePrice, parseQuantity } from "./precision";

describe("dbBuffer error recovery", () => {
    test("re-queues orders, fills, and balances when transaction fails", async () => {
        const order: MemoryOrder = {
            id: "retry-ord-1",
            userId: "user-1",
            side: "BUY",
            symbol: "SOL",
            type: "LIMIT",
            price: parsePrice(100),
            quantity: parseQuantity(5, "SOL"),
            filledQuantity: 0n,
            status: "PENDING",
        };

        queueOrderUpsert(order, "stock-1");
        queueFillsInsert([{
            stockId: "stock-1",
            symbol: "SOL",
            buyOrderId: "retry-ord-1",
            sellOrderId: "sell-1",
            price: parsePrice(100),
            quantity: parseQuantity(2, "SOL"),
        }]);
        queueBalanceUpdate("bal-1", 500n, 100n, "INR");

        const originalTransaction = prisma.$transaction;
        let callCount = 0;

        prisma.$transaction = mock(async () => {
            callCount++;
            if (callCount === 1) {
                throw new Error("DB Connection Error");
            }
            return [];
        }) as typeof prisma.$transaction;

        try {
            await flushDbBuffer();
            expect(callCount).toBe(1);

            await flushDbBuffer();
            expect(callCount).toBe(2);
        } finally {
            prisma.$transaction = originalTransaction;
        }
    });

    test("concurrent callers await activeFlushPromise completion", async () => {
        const originalTransaction = prisma.$transaction;
        let inFlight = false;

        prisma.$transaction = mock(async () => {
            inFlight = true;
            await new Promise((resolve) => setTimeout(resolve, 50));
            inFlight = false;
            return [];
        }) as typeof prisma.$transaction;

        try {
            queueBalanceUpdate("bal-concurrent", 100n, 0n, "INR");

            const p1 = flushDbBuffer();
            const p2 = flushDbBuffer();
            const p3 = flushDbBuffer();

            await Promise.all([p1, p2, p3]);

            expect(inFlight).toBe(false);
        } finally {
            prisma.$transaction = originalTransaction;
        }
    });
});
