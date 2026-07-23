import { describe, expect, test, mock } from "bun:test";
import { queueOrderUpsert, queueFillsInsert, queueBalanceUpdate, flushDbBuffer } from "./dbBuffer";
import { prisma } from "../prisma";
import type { MemoryOrder } from "../types/order";

describe("dbBuffer error recovery", () => {
    test("re-queues orders, fills, and balances when transaction fails", async () => {
        const order: MemoryOrder = {
            id: "retry-ord-1",
            userId: "user-1",
            side: "BUY",
            symbol: "SOL",
            type: "LIMIT",
            price: 100,
            quantity: 5,
            filledQuantity: 0,
            status: "PENDING",
        };

        queueOrderUpsert(order, "stock-1");
        queueFillsInsert([{ stockId: "stock-1", buyOrderId: "retry-ord-1", sellOrderId: "sell-1", price: 100, quantity: 2 }]);
        queueBalanceUpdate("bal-1", 500, 100);

        // Mock prisma.$transaction to throw error on first call
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
            await flushDbBuffer(); // First attempt fails and re-enqueues
            expect(callCount).toBe(1);

            // Second flush should succeed with re-queued items
            await flushDbBuffer();
            expect(callCount).toBe(2);
        } finally {
            prisma.$transaction = originalTransaction;
        }
    });

    test("concurrent callers await activeFlushPromise completion", async () => {
        const originalTransaction = prisma.$transaction;
        let inFlight = false;
        let maxConcurrentCalls = 0;

        prisma.$transaction = mock(async () => {
            inFlight = true;
            await new Promise((resolve) => setTimeout(resolve, 50));
            inFlight = false;
            return [];
        }) as typeof prisma.$transaction;

        try {
            queueBalanceUpdate("bal-concurrent", 100, 0);

            // Invoke flushDbBuffer concurrently
            const p1 = flushDbBuffer();
            const p2 = flushDbBuffer();
            const p3 = flushDbBuffer();

            await Promise.all([p1, p2, p3]);

            // All callers finished after in-flight flush resolved
            expect(inFlight).toBe(false);
        } finally {
            prisma.$transaction = originalTransaction;
        }
    });
});
