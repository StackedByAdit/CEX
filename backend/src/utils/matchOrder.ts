import { prisma } from "../prisma";
import { ORDERBOOK } from "../state";
import type { MemoryOrder } from "../types/order";
import { assureBalance } from "./assureBalance";
import { roundInr, roundQty } from "./marketOrder";

export interface MatchResult {
    status: MemoryOrder["status"];
    filledQuantity: number;
    fills: { price: number; quantity: number }[];
    counterPartyUserIds: string[];
    actualQuote: number;
    refundQuote: number;
}

export async function matchOrder(order: MemoryOrder, stockId: string): Promise<MatchResult> {
    const counterPartyUserIds: string[] = [];
    const firm = ORDERBOOK[order.symbol];
    if (!firm) {
        return {
            status: order.status,
            filledQuantity: order.filledQuantity,
            fills: [],
            counterPartyUserIds: [],
            actualQuote: 0,
            refundQuote: 0,
        };
    }

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
                counterPartyUserIds.push(sellOrder.userId);

                order.filledQuantity += tradeQty;
                sellOrder.filledQuantity += tradeQty;

                const [sellerStock, sellerInr, buyerStock, buyerInr] = await Promise.all([
                    assureBalance(sellOrder.userId, order.symbol),
                    assureBalance(sellOrder.userId, "INR"),
                    assureBalance(order.userId, order.symbol),
                    assureBalance(order.userId, "INR"),
                ]);

                buyerInr.locked -= tradeQty * price;
                buyerStock.available += tradeQty;
                sellerStock.locked -= tradeQty;
                sellerInr.available += tradeQty * price;

                Promise.all([
                    prisma.fill.create({
                        data: { stockId, buyOrderId: order.id, sellOrderId: sellOrder.id, price, quantity: tradeQty },
                    }),
                    prisma.balance.update({
                        where: { id: buyerInr.balanceId },
                        data: { locked: { decrement: tradeQty * price } },
                    }),
                    prisma.balance.update({
                        where: { id: buyerStock.balanceId },
                        data: { available: { increment: tradeQty } },
                    }),
                    prisma.balance.update({
                        where: { id: sellerStock.balanceId },
                        data: { locked: { decrement: tradeQty } },
                    }),
                    prisma.balance.update({
                        where: { id: sellerInr.balanceId },
                        data: { available: { increment: tradeQty * price } },
                    }),
                    prisma.order.update({
                        where: { id: sellOrder.id },
                        data: {
                            filledQuantity: sellOrder.filledQuantity,
                            status: sellOrder.filledQuantity === sellOrder.quantity ? "FILLED" : "PARTIALLY_FILLED",
                        },
                    }),
                ]).catch(err => console.error("DB sync error (buy match):", err));

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

                counterPartyUserIds.push(buyOrder.userId);

                order.filledQuantity += tradeQty;
                buyOrder.filledQuantity += tradeQty;

                const [buyerStock, buyerInr, sellerStock, sellerInr] = await Promise.all([
                    assureBalance(buyOrder.userId, order.symbol),
                    assureBalance(buyOrder.userId, "INR"),
                    assureBalance(order.userId, order.symbol),
                    assureBalance(order.userId, "INR"),
                ]);

                buyerInr.locked -= tradeQty * price;
                buyerStock.available += tradeQty;
                sellerStock.locked -= tradeQty;
                sellerInr.available += tradeQty * price;

                Promise.all([
                    prisma.fill.create({
                        data: { stockId, buyOrderId: buyOrder.id, sellOrderId: order.id, price, quantity: tradeQty },
                    }),
                    prisma.balance.update({
                        where: { id: buyerInr.balanceId },
                        data: { locked: { decrement: tradeQty * price } },
                    }),
                    prisma.balance.update({
                        where: { id: buyerStock.balanceId },
                        data: { available: { increment: tradeQty } },
                    }),
                    prisma.balance.update({
                        where: { id: sellerStock.balanceId },
                        data: { locked: { decrement: tradeQty } },
                    }),
                    prisma.balance.update({
                        where: { id: sellerInr.balanceId },
                        data: { available: { increment: tradeQty * price } },
                    }),
                    prisma.order.update({
                        where: { id: buyOrder.id },
                        data: {
                            filledQuantity: buyOrder.filledQuantity,
                            status: buyOrder.filledQuantity === buyOrder.quantity ? "FILLED" : "PARTIALLY_FILLED",
                        },
                    }),
                ]).catch(err => console.error("DB sync error (sell match):", err));

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

    const actualQuote = roundInr(fills.reduce((sum, fill) => sum + fill.price * fill.quantity, 0));
    let refundQuote = 0;

    if (order.type === "MARKET") {
        if (order.side === "BUY") {
            const locked = order.lockedQuoteAmount ?? 0;
            refundQuote = roundInr(Math.max(0, locked - actualQuote));

            if (refundQuote > 0) {
                const buyerInr = await assureBalance(order.userId, "INR");
                buyerInr.locked -= refundQuote;
                buyerInr.available += refundQuote;

                prisma.balance.update({
                    where: { id: buyerInr.balanceId },
                    data: {
                        locked: { decrement: refundQuote },
                        available: { increment: refundQuote },
                    },
                }).catch(err => console.error("DB sync error (market buy refund):", err));
            }

            order.lockedQuoteAmount = undefined;
        } else {
            const unfilledQty = roundQty(order.quantity - order.filledQuantity);
            if (unfilledQty > 0) {
                const sellerStock = await assureBalance(order.userId, order.symbol);
                sellerStock.locked -= unfilledQty;
                sellerStock.available += unfilledQty;

                prisma.balance.update({
                    where: { id: sellerStock.balanceId },
                    data: {
                        locked: { decrement: unfilledQty },
                        available: { increment: unfilledQty },
                    },
                }).catch(err => console.error("DB sync error (market sell refund):", err));
            }
        }
    }

    if (order.type === "MARKET") {
        if (order.filledQuantity === order.quantity) {
            order.status = "FILLED";
        } else if (order.filledQuantity > 0) {
            order.status = "PARTIALLY_FILLED";
        } else {
            order.status = "CANCELLED";
        }
    } else if (order.filledQuantity === order.quantity) {
        order.status = "FILLED";
    } else if (order.filledQuantity > 0) {
        order.status = "PARTIALLY_FILLED";
    } else {
        order.status = "PENDING";
    }

return {
        status: order.status,
        filledQuantity: order.filledQuantity,
        fills,
        counterPartyUserIds,
        actualQuote,
        refundQuote,
    };
}