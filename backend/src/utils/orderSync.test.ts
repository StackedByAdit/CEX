import { describe, expect, test } from "bun:test";
import { syncOrderStatus } from "./orderSync";
import type { MemoryOrder } from "../types/order";

describe("syncOrderStatus", () => {
    test("preserves CANCELLED status even if filledQuantity > 0", () => {
        const order: MemoryOrder = {
            id: "ord-1",
            userId: "user-1",
            side: "BUY",
            symbol: "SOL",
            type: "LIMIT",
            price: 100,
            quantity: 10,
            filledQuantity: 4,
            status: "CANCELLED",
        };

        syncOrderStatus(order);
        expect(order.status).toBe("CANCELLED");
    });

    test("sets status to PARTIALLY_FILLED for active partially filled order", () => {
        const order: MemoryOrder = {
            id: "ord-2",
            userId: "user-1",
            side: "BUY",
            symbol: "SOL",
            type: "LIMIT",
            price: 100,
            quantity: 10,
            filledQuantity: 4,
            status: "PENDING",
        };

        syncOrderStatus(order);
        expect(order.status).toBe("PARTIALLY_FILLED");
    });

    test("sets status to FILLED when filledQuantity equals quantity", () => {
        const order: MemoryOrder = {
            id: "ord-3",
            userId: "user-1",
            side: "BUY",
            symbol: "SOL",
            type: "LIMIT",
            price: 100,
            quantity: 10,
            filledQuantity: 10,
            status: "PARTIALLY_FILLED",
        };

        syncOrderStatus(order);
        expect(order.status).toBe("FILLED");
    });

    test("sets status to PENDING when filledQuantity is 0 and status is not CANCELLED", () => {
        const order: MemoryOrder = {
            id: "ord-4",
            userId: "user-1",
            side: "BUY",
            symbol: "SOL",
            type: "LIMIT",
            price: 100,
            quantity: 10,
            filledQuantity: 0,
            status: "PENDING",
        };

        syncOrderStatus(order);
        expect(order.status).toBe("PENDING");
    });
});
