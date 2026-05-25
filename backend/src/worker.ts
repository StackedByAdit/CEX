import { redisClient, publisher, workerClient } from "./redis";
import { matchOrder } from "./utils/matchOrder";
import { ORDERS, ORDERBOOK, BALANCES } from "./state";
import { prisma } from "./prisma";
import type { MemoryOrder } from "./types/order";

async function processOrder(order: MemoryOrder, stockId: string) {

    ORDERS.push(order);

    const result = await matchOrder(order, stockId);

    prisma.order.update({
        where: { id: order.id },
        data: { filledQuantity: result.filledQuantity, status: result.status },
    }).catch(err => console.error("DB sync error (order update):", err));

    await publisher.publish(`orderbook:${order.symbol}`, JSON.stringify({
        symbol: order.symbol,
        bids: ORDERBOOK[order.symbol]!.bids,
        asks: ORDERBOOK[order.symbol]!.asks,
    }));

    for (const fill of result.fills) {
        await publisher.publish(`trades:${order.symbol}`, JSON.stringify({
            symbol: order.symbol,
            price: fill.price,
            quantity: fill.quantity,
            timestamp: Date.now(),
        }));
    }

    if (result.fills.length > 0) {
        const counterPartyUserIds = new Set<string>([order.userId, ...result.counterPartyUserIds]);
        for (const userId of counterPartyUserIds) {
            if (BALANCES[userId]) {
                await publisher.publish("balance:update", JSON.stringify({
                    userId,
                    balances: BALANCES[userId]
                }));
            }
        }
    }

    await redisClient.lpush(`result:${order.id}`, JSON.stringify(result));
    console.log("Result pushed for:", order.id);
}

export async function runWorker() {
    console.log("Worker running...");
    while (true) {
        const res = await workerClient.brpop("queue:orders", 0);
        if (!res) continue;
        console.log("Worker picked up order:", res[1]);
        const { stockId, ...order }: MemoryOrder & { stockId: string } = JSON.parse(res[1]);
        await processOrder(order, stockId);
        console.log("Worker finished order:", order.id);
    }
}