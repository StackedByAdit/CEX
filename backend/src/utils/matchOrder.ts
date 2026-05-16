import { prisma } from "../prisma";
import { ORDERBOOK } from "../state";
import type { MemoryOrder } from "../types/order";
import { assureBalance } from "./assureBalance";

export interface MatchResult {
    status: MemoryOrder["status"];
    filledQuantity: number;
    fills: { price: number; quantity: number }[];
}

export async function matchOrder(order: MemoryOrder, stockId: string): Promise<MatchResult> {
    const firm = ORDERBOOK[order.symbol];
    if (!firm) return { status: order.status, filledQuantity: order.filledQuantity, fills: [] };

    const fills: { price: number; quantity: number }[] = [];

    if (order.side === "BUY") {

        const askPrices = Object.keys(firm.asks).map(Number).sort((a, b) => a - b);

        for (const price of askPrices) {

            if (order.type === "LIMIT" && price > order.price!) break;

            const ordersAtPrice = firm.asks[price];
            if (!ordersAtPrice) continue;

            while (ordersAtPrice.length > 0 && order.filledQuantity < order.quantity) {

                const sellOrder = ordersAtPrice[0]!;
                const tradeQty = Math.min(
                    order.quantity - order.filledQuantity,
                    sellOrder.quantity - sellOrder.filledQuantity
                );

                order.filledQuantity += tradeQty;
                sellOrder.filledQuantity += tradeQty;

                const [sellerStockBalance, sellerInrBalance, buyerStockBalance, buyerInrBalance] =
                    await Promise.all([
                        assureBalance(sellOrder.userId, order.symbol),
                        assureBalance(sellOrder.userId, "INR"),
                        assureBalance(order.userId, order.symbol),
                        assureBalance(order.userId, "INR"),
                    ]);

                await Promise.all([
                    prisma.fill.create({
                        data: { stockId, buyOrderId: order.id, sellOrderId: sellOrder.id, price, quantity: tradeQty },
                    }),
                    prisma.balance.update({
                        where: { id: buyerInrBalance.id },
                        data: { locked: { decrement: tradeQty * price } },
                    }),
                    prisma.balance.update({
                        where: { id: buyerStockBalance.id },
                        data: { available: { increment: tradeQty } },
                    }),
                    prisma.balance.update({
                        where: { id: sellerStockBalance.id },
                        data: { locked: { decrement: tradeQty } },
                    }),
                    prisma.balance.update({
                        where: { id: sellerInrBalance.id },
                        data: { available: { increment: tradeQty * price } },
                    }),
                    prisma.order.update({
                        where: { id: sellOrder.id },
                        data: {
                            filledQuantity: sellOrder.filledQuantity,
                            status: sellOrder.filledQuantity === sellOrder.quantity ? "FILLED" : "PARTIALLY_FILLED",
                        },
                    }),
                ]);

                fills.push({ price, quantity: tradeQty });

                if (sellOrder.filledQuantity === sellOrder.quantity) {
                    sellOrder.status = "FILLED";
                    ordersAtPrice.shift();
                }

                if (order.filledQuantity === order.quantity) break;
            }

            if (ordersAtPrice.length === 0) delete firm.asks[price];
            if (order.filledQuantity === order.quantity) break;
        }

    } else {

        const bidPrices = Object.keys(firm.bids).map(Number).sort((a, b) => b - a);

        for (const price of bidPrices) {

            if (order.type === "LIMIT" && price < order.price!) break;

            const ordersAtPrice = firm.bids[price];
            if (!ordersAtPrice) continue;

            while (ordersAtPrice.length > 0 && order.filledQuantity < order.quantity) {

                const buyOrder = ordersAtPrice[0]!;
                const tradeQty = Math.min(
                    order.quantity - order.filledQuantity,
                    buyOrder.quantity - buyOrder.filledQuantity
                );

                order.filledQuantity += tradeQty;
                buyOrder.filledQuantity += tradeQty;

                const [buyerStockBalance, buyerInrBalance, sellerStockBalance, sellerInrBalance] =
                    await Promise.all([
                        assureBalance(buyOrder.userId, order.symbol),
                        assureBalance(buyOrder.userId, "INR"),
                        assureBalance(order.userId, order.symbol),
                        assureBalance(order.userId, "INR"),
                    ]);

                await Promise.all([
                    prisma.fill.create({
                        data: { stockId, buyOrderId: buyOrder.id, sellOrderId: order.id, price, quantity: tradeQty },
                    }),
                    prisma.balance.update({
                        where: { id: buyerInrBalance.id },
                        data: { locked: { decrement: tradeQty * price } },
                    }),
                    prisma.balance.update({
                        where: { id: buyerStockBalance.id },
                        data: { available: { increment: tradeQty } },
                    }),
                    prisma.balance.update({
                        where: { id: sellerStockBalance.id },
                        data: { locked: { decrement: tradeQty } },
                    }),
                    prisma.balance.update({
                        where: { id: sellerInrBalance.id },
                        data: { available: { increment: tradeQty * price } },
                    }),
                    prisma.order.update({
                        where: { id: buyOrder.id },
                        data: {
                            filledQuantity: buyOrder.filledQuantity,
                            status: buyOrder.filledQuantity === buyOrder.quantity ? "FILLED" : "PARTIALLY_FILLED",
                        },
                    }),
                ]);

                fills.push({ price, quantity: tradeQty });

                if (buyOrder.filledQuantity === buyOrder.quantity) {
                    buyOrder.status = "FILLED";
                    ordersAtPrice.shift();
                }

                if (order.filledQuantity === order.quantity) break;
            }

            if (ordersAtPrice.length === 0) delete firm.bids[price];
            if (order.filledQuantity === order.quantity) break;
        }
    }

    if (order.filledQuantity < order.quantity && order.type === "LIMIT") {
        if (order.side === "BUY") {
            if (!firm.bids[order.price!]) firm.bids[order.price!] = [];
            firm.bids[order.price!]!.push(order);
        } else {
            if (!firm.asks[order.price!]) firm.asks[order.price!] = [];
            firm.asks[order.price!]!.push(order);
        }
    }

    if (order.filledQuantity === order.quantity) {
        order.status = "FILLED";
    } else if (order.filledQuantity > 0) {
        order.status = "PARTIALLY_FILLED";
    } else {
        order.status = "PENDING";
    }

    return { status: order.status, filledQuantity: order.filledQuantity, fills };
}