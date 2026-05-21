import { redisClient, publisher } from "./redis";
import { matchOrder } from "./utils/matchOrder";
import { ORDERS, ORDERBOOK } from "./state";
import { prisma } from "./prisma";
import type { MemoryOrder } from "./types/order";

async function processOrder(order: MemoryOrder, stockId: string) {

    ORDERS.push(order);

    const result = await matchOrder(order, stockId);

    await prisma.order.update({
        where: { id: order.id },
        data: { filledQuantity: result.filledQuantity, status: result.status },
    });

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

    await redisClient.lpush(`result:${order.id}`, JSON.stringify(result));
}

async function run() {
    console.log("Worker running...");
    while (true) {
        const res = await redisClient.brpop("queue:orders", 0);
        if (!res) continue;
        const { stockId, ...order }: MemoryOrder & { stockId: string } = JSON.parse(res[1]);
        await processOrder(order, stockId);
    }
}

run();