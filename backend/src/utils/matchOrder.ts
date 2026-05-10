import { prisma } from "../prisma";
import { assureBalance } from "./assureBalance";
import type { MemoryOrder } from "../types/order";
import { ORDERBOOK } from "../state";

export async function matchOrder(order: MemoryOrder): Promise<void> {

    const firm = ORDERBOOK[order.symbol];
    if (!firm) return;

    const stock = await prisma.stock.findUnique({ where: { symbol: order.symbol } });
    if (!stock) throw new Error(`Stock ${order.symbol} not found`);

    if (order.side === "BUY") {

        if (order.type === "LIMIT" && order.price === undefined) {
            throw new Error("LIMIT order must have price");
        }

        const askPrices = Object.keys(firm.asks).map(Number);
        askPrices.sort((a, b) => a - b);

        for (const price of askPrices) {

            if (order.type === "LIMIT" && order.price !== undefined) {
                if (price > order.price) break;
            }

            const ordersAtPrice = firm.asks[price];
            if (!ordersAtPrice) continue;

            while (ordersAtPrice.length > 0 && order.filledQuantity < order.quantity) {

                const sellOrder = ordersAtPrice[0];
                if (!sellOrder) break;

                const remainingBuy = order.quantity - order.filledQuantity;
                const remainingSell = sellOrder.quantity - sellOrder.filledQuantity;
                const tradeQty = Math.min(remainingBuy, remainingSell);

                order.filledQuantity += tradeQty;
                sellOrder.filledQuantity += tradeQty;

                const sellerStockBalance = await assureBalance(sellOrder.userId, order.symbol);
                const sellerInrBalance = await assureBalance(sellOrder.userId, "INR");
                const buyerStockBalance = await assureBalance(order.userId, order.symbol);
                const buyerInrBalance = await assureBalance(order.userId, "INR");

                if (!sellerStockBalance || !sellerInrBalance || !buyerStockBalance || !buyerInrBalance) {
                    throw new Error("Failed to assure balances for trade");
                }

                await prisma.fill.create({
                    data: {
                        stockId: stock.id,
                        buyOrderId: order.id,
                        sellOrderId: sellOrder.id,
                        price,
                        quantity: tradeQty,
                    },
                });

                await prisma.balance.update({
                    where: { id: buyerInrBalance.id },
                    data: { locked: { decrement: tradeQty * price } },
                });
                await prisma.balance.update({
                    where: { id: buyerStockBalance.id },
                    data: { available: { increment: tradeQty } },
                });
                await prisma.balance.update({
                    where: { id: sellerStockBalance.id },
                    data: { locked: { decrement: tradeQty } },
                });
                await prisma.balance.update({
                    where: { id: sellerInrBalance.id },
                    data: { available: { increment: tradeQty * price } },
                });

                if (sellOrder.filledQuantity === sellOrder.quantity) {
                    sellOrder.status = "FILLED";
                    ordersAtPrice.shift();
                    await prisma.order.update({
                        where: { id: sellOrder.id },
                        data: { filledQuantity: sellOrder.filledQuantity, status: "FILLED" },
                    });
                } else {
                    await prisma.order.update({
                        where: { id: sellOrder.id },
                        data: { filledQuantity: sellOrder.filledQuantity, status: "PARTIALLY_FILLED" },
                    });
                }

                if (order.filledQuantity === order.quantity) {
                    order.status = "FILLED";
                    return;
                }
            }

            if (ordersAtPrice.length === 0) {
                delete firm.asks[price];
            }
        }

        if (order.filledQuantity === order.quantity) {
            order.status = "FILLED";
        } else if (order.filledQuantity > 0) {
            order.status = "PARTIALLY_FILLED";
        }

    } else {

        if (order.type === "LIMIT" && order.price === undefined) {
            throw new Error("LIMIT order must have price");
        }

        const bidPrices = Object.keys(firm.bids).map(Number);
        bidPrices.sort((a, b) => b - a);

        for (const price of bidPrices) {

            if (order.type === "LIMIT" && order.price !== undefined) {
                if (price < order.price) break;
            }

            const ordersAtPrice = firm.bids[price];
            if (!ordersAtPrice) continue;

            while (ordersAtPrice.length > 0 && order.filledQuantity < order.quantity) {

                const buyOrder = ordersAtPrice[0];
                if (!buyOrder) break;

                const remainingSell = order.quantity - order.filledQuantity;
                const remainingBuy = buyOrder.quantity - buyOrder.filledQuantity;

                const tradeQty = Math.min(remainingSell, remainingBuy);

                order.filledQuantity += tradeQty;
                buyOrder.filledQuantity += tradeQty;

                const buyerStockBalance = await assureBalance(buyOrder.userId, order.symbol);
                const buyerInrBalance = await assureBalance(buyOrder.userId, "INR");
                const sellerStockBalance = await assureBalance(order.userId, order.symbol);
                const sellerInrBalance = await assureBalance(order.userId, "INR");

                if (!sellerStockBalance || !sellerInrBalance || !buyerStockBalance || !buyerInrBalance) {
                    throw new Error("Failed to assure balances for trade");
                }

                await prisma.fill.create({
                    data: {
                        stockId: stock.id,
                        buyOrderId: buyOrder.id,
                        sellOrderId: order.id,
                        price,
                        quantity: tradeQty,
                    },
                });

                await prisma.balance.update({
                    where: { id: buyerInrBalance.id },
                    data: { locked: { decrement: tradeQty * price } },
                });
                await prisma.balance.update({
                    where: { id: buyerStockBalance.id },
                    data: { available: { increment: tradeQty } },
                });
                await prisma.balance.update({
                    where: { id: sellerStockBalance.id },
                    data: { locked: { decrement: tradeQty } },
                });
                await prisma.balance.update({
                    where: { id: sellerInrBalance.id },
                    data: { available: { increment: tradeQty * price } },
                });

                if (buyOrder.filledQuantity === buyOrder.quantity) {
                    buyOrder.status = "FILLED";
                    ordersAtPrice.shift();
                    await prisma.order.update({
                        where: { id: buyOrder.id },
                        data: { filledQuantity: buyOrder.filledQuantity, status: "FILLED" },
                    });
                } else {
                    await prisma.order.update({
                        where: { id: buyOrder.id },
                        data: { filledQuantity: buyOrder.filledQuantity, status: "PARTIALLY_FILLED" },
                    });
                }

                if (order.filledQuantity === order.quantity) {
                    order.status = "FILLED";
                    return;
                }
            }

            if (ordersAtPrice.length === 0) {
                delete firm.bids[price];
            }
        }

        if (order.filledQuantity === order.quantity) {
            order.status = "FILLED";

        } else if (order.filledQuantity > 0) {

            order.status = "PARTIALLY_FILLED";
        }
    }
}