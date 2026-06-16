import { ORDERBOOK } from "../state";
import type { MemoryOrder } from "../types/order";
import { getBalance } from "./assureBalance";
import { roundInr, roundQty } from "./marketOrder";
import { prisma } from "../prisma";

export interface MatchFillRecord {
    buyOrderId: string;
    sellOrderId: string;
    price: number;
    quantity: number;
}

export interface MatchResult {
    status: MemoryOrder["status"];
    filledQuantity: number;
    fills: { price: number; quantity: number }[];
    fillRecords: MatchFillRecord[];
    counterPartyOrders: MemoryOrder[];
    counterPartyUserIds: string[];
    actualQuote: number;
    refundQuote: number;
}

function trackCounterParty(
    counterPartyOrders: Map<string, MemoryOrder>,
    counterPartyUserIds: string[],
    order: MemoryOrder,
) {
    counterPartyOrders.set(order.id, order);
    counterPartyUserIds.push(order.userId);
}

export function matchOrder(order: MemoryOrder, _stockId: string): MatchResult {
    const counterPartyUserIds: string[] = [];
    const counterPartyOrders = new Map<string, MemoryOrder>();
    const fillRecords: MatchFillRecord[] = [];
    const firm = ORDERBOOK[order.symbol];
    if (!firm) {
        return {
            status: order.status,
            filledQuantity: order.filledQuantity,
            fills: [],
            fillRecords: [],
            counterPartyOrders: [],
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
                trackCounterParty(counterPartyOrders, counterPartyUserIds, sellOrder);

                order.filledQuantity += tradeQty;
                sellOrder.filledQuantity += tradeQty;

                const sellerStock = getBalance(sellOrder.userId, order.symbol);
                const sellerInr = getBalance(sellOrder.userId, "INR");
                const buyerStock = getBalance(order.userId, order.symbol);
                const buyerInr = getBalance(order.userId, "INR");

                buyerInr.locked -= tradeQty * price;
                buyerStock.available += tradeQty;
                sellerStock.locked -= tradeQty;
                sellerInr.available += tradeQty * price;

                Promise.all([
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
                ]).catch(err => console.error("DB sync error (buy match balances):", err));

                fillRecords.push({
                    buyOrderId: order.id,
                    sellOrderId: sellOrder.id,
                    price,
                    quantity: tradeQty,
                });
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

                trackCounterParty(counterPartyOrders, counterPartyUserIds, buyOrder);

                order.filledQuantity += tradeQty;
                buyOrder.filledQuantity += tradeQty;

                const buyerStock = getBalance(buyOrder.userId, order.symbol);
                const buyerInr = getBalance(buyOrder.userId, "INR");
                const sellerStock = getBalance(order.userId, order.symbol);
                const sellerInr = getBalance(order.userId, "INR");

                buyerInr.locked -= tradeQty * price;
                buyerStock.available += tradeQty;
                sellerStock.locked -= tradeQty;
                sellerInr.available += tradeQty * price;

                Promise.all([
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
                ]).catch(err => console.error("DB sync error (sell match balances):", err));

                fillRecords.push({
                    buyOrderId: buyOrder.id,
                    sellOrderId: order.id,
                    price,
                    quantity: tradeQty,
                });
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
                const buyerInr = getBalance(order.userId, "INR");
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
                const sellerStock = getBalance(order.userId, order.symbol);
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
        if (order.filledQuantity > 0) {
            order.status = "FILLED";
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
        fillRecords,
        counterPartyOrders: Array.from(counterPartyOrders.values()),
        counterPartyUserIds,
        actualQuote,
        refundQuote,
    };
}
