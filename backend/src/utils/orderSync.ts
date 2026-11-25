import { prisma } from "../prisma";
import { ORDERS, ORDERBOOK } from "../state";
import type { MemoryOrder } from "../types/order";
import BTree from "sorted-btree";
import { calculateQuote, parsePrice, parseQuantity, priceToDecimalString, quantityToDecimalString } from "./precision";

function orderStatus(order: MemoryOrder): MemoryOrder["status"] {
    if (order.status === "CANCELLED") return "CANCELLED";
    if (order.type === "MARKET") return order.status;
    if (order.filledQuantity === order.quantity) return "FILLED";
    if (order.filledQuantity > 0n) return "PARTIALLY_FILLED";
    return "PENDING";
}

export function syncOrderStatus(order: MemoryOrder) {
    order.status = orderStatus(order);
}

export async function upsertOrder(order: MemoryOrder, stockId: string) {
    syncOrderStatus(order);

    const existing = await prisma.order.findUnique({
        where: { id: order.id },
        select: { filledQuantity: true },
    });

    if (existing) {
        const existingFilled = parseQuantity(existing.filledQuantity.toString(), order.symbol);
        if (order.filledQuantity < existingFilled) {
            return;
        }
    }

    await prisma.order.upsert({
        where: { id: order.id },
        create: {
            id: order.id,
            userId: order.userId,
            stockId,
            side: order.side,
            type: order.type,
            status: order.status,
            price: order.type === "LIMIT" && order.price != null ? priceToDecimalString(order.price) : null,
            quantity: quantityToDecimalString(order.quantity, order.symbol),
            filledQuantity: quantityToDecimalString(order.filledQuantity, order.symbol),
        },
        update: {
            filledQuantity: quantityToDecimalString(order.filledQuantity, order.symbol),
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
        orderBy: { createdAt: "asc" },
    });

    for (const row of openOrders) {
        if (ORDERS.some((order) => order.id === row.id)) continue;
        if (row.price == null) continue;

        const qtyBi = parseQuantity(row.quantity.toString(), row.stock.symbol);
        const filledBi = parseQuantity(row.filledQuantity.toString(), row.stock.symbol);
        const remainingBi = qtyBi > filledBi ? qtyBi - filledBi : 0n;
        const priceBi = parsePrice(row.price.toString());

        const order: MemoryOrder = {
            id: row.id,
            userId: row.userId,
            side: row.side,
            type: row.type,
            symbol: row.stock.symbol,
            price: priceBi,
            quantity: qtyBi,
            filledQuantity: filledBi,
            status: row.status,
            lockedQuoteAmount: row.side === "BUY" && remainingBi > 0n
                ? calculateQuote(remainingBi, priceBi, row.stock.symbol, "up")
                : undefined,
        };

        ORDERS.push(order);

        if (!ORDERBOOK[order.symbol]) {
            ORDERBOOK[order.symbol] = {
                bids: new BTree(undefined, (a, b) => (a < b ? -1 : a > b ? 1 : 0)),
                asks: new BTree(undefined, (a, b) => (a < b ? -1 : a > b ? 1 : 0)),
            };
        }
        const firm = ORDERBOOK[order.symbol]!;

        const bookSide = order.side === "BUY" ? firm.bids : firm.asks;
        if (order.price !== undefined) {
            let list = bookSide.get(order.price);
            if (!list) {
                list = [];
                bookSide.set(order.price, list);
            }
            if (!list.some((entry) => entry.id === order.id)) {
                list.push(order);
            }
        }
    }
}
