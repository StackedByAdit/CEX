import { describe, expect, test } from "bun:test";
import { syncOrderStatus } from "./orderSync";
import type { MemoryOrder } from "../types/order";
import { parsePrice, parseQuantity } from "./precision";

describe("syncOrderStatus", () => {
    test("preserves CANCELLED status even if filledQuantity > 0", () => {
        const order: MemoryOrder = {
            id: "ord-1",
            userId: "user-1",
            side: "BUY",
            symbol: "SOL",
            type: "LIMIT",
            price: parsePrice(100),
            quantity: parseQuantity(10, "SOL"),
            filledQuantity: parseQuantity(4, "SOL"),
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
            price: parsePrice(100),
            quantity: parseQuantity(10, "SOL"),
            filledQuantity: parseQuantity(4, "SOL"),
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
            price: parsePrice(100),
            quantity: parseQuantity(10, "SOL"),
            filledQuantity: parseQuantity(10, "SOL"),
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
            price: parsePrice(100),
            quantity: parseQuantity(10, "SOL"),
            filledQuantity: 0n,
            status: "PENDING",
        };

        syncOrderStatus(order);
        expect(order.status).toBe("PENDING");
    });

    test("preserves FILLED status for partially filled MARKET order", () => {
        const order: MemoryOrder = {
            id: "ord-mkt-1",
            userId: "user-1",
            side: "BUY",
            symbol: "SOL",
            type: "MARKET",
            quantity: parseQuantity(10, "SOL"),
            filledQuantity: parseQuantity(4, "SOL"),
            status: "FILLED",
        };

        syncOrderStatus(order);
        expect(order.status).toBe("FILLED");
    });
});
