import { prisma } from "../prisma";
import { ORDERS, ORDERBOOK } from "../state";
import type { MemoryOrder } from "../types/order";

function orderStatus(order: MemoryOrder): MemoryOrder["status"] {
    if (order.filledQuantity === order.quantity) return "FILLED";
    if (order.filledQuantity > 0) return "PARTIALLY_FILLED";
    return order.status === "CANCELLED" ? "CANCELLED" : "PENDING";
}

export function syncOrderStatus(order: MemoryOrder) {
    order.status = orderStatus(order);
}

export async function upsertOrder(order: MemoryOrder, stockId: string) {
    syncOrderStatus(order);

    await prisma.order.upsert({
        where: { id: order.id },
        create: {
            id: order.id,
            userId: order.userId,
            stockId,
            side: order.side,
            type: order.type,
            status: order.status,
            price: order.type === "LIMIT" ? order.price! : null,
            quantity: order.quantity,
            filledQuantity: order.filledQuantity,
        },
        update: {
            filledQuantity: order.filledQuantity,
            status: order.status,
        },
    });
}

export async function restoreOpenOrders() {
    const openOrders = await prisma.order.findMany({
        where: {
            type: "LIMIT",
            status: { in: ["PENDING", "PARTIALLY_FILLED"] },
        },
        include: { stock: true },
    });

    for (const row of openOrders) {
        if (ORDERS.some((order) => order.id === row.id)) continue;
        if (row.price == null) continue;

        const order: MemoryOrder = {
            id: row.id,
            userId: row.userId,
            side: row.side,
            type: row.type,
            symbol: row.stock.symbol,
            price: row.price.toNumber(),
            quantity: row.quantity.toNumber(),
            filledQuantity: row.filledQuantity.toNumber(),
            status: row.status,
        };

        ORDERS.push(order);

        const firm = ORDERBOOK[order.symbol];
        if (!firm) continue;

        const bookSide = order.side === "BUY" ? firm.bids : firm.asks;
        if (!bookSide[order.price]) bookSide[order.price] = [];
        if (!bookSide[order.price]!.some((entry) => entry.id === order.id)) {
            bookSide[order.price]!.push(order);
        }
    }
}
