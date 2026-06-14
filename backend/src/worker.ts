import { redisClient, publisher, workerClient } from "./redis";
import { matchOrder, type MatchResult } from "./utils/matchOrder";
import { ORDERS, ORDERBOOK, BALANCES } from "./state";
import { prisma } from "./prisma";
import type { MemoryOrder } from "./types/order";
import { processTrade } from "./utils/candle";

function postProcessOrder(order: MemoryOrder, stockId: string, result: MatchResult) {
    prisma.order.update({
        where: { id: order.id },
        data: { filledQuantity: result.filledQuantity, status: result.status },
    }).catch(err => console.error("DB sync error (order update):", err));

    void publisher.publish(`orderbook:${order.symbol}`, JSON.stringify({
        symbol: order.symbol,
        bids: ORDERBOOK[order.symbol]!.bids,
        asks: ORDERBOOK[order.symbol]!.asks,
    })).catch(err => console.error("Orderbook publish error:", err));

    for (const fill of result.fills) {
        void publisher.publish(`trades:${order.symbol}`, JSON.stringify({
            symbol: order.symbol,
            price: fill.price,
            quantity: fill.quantity,
            timestamp: Date.now(),
        })).catch(err => console.error("Trade publish error:", err));

        void processTrade(order.symbol, fill.price, fill.quantity, Date.now()).catch(err => {
            console.error("Candle processing error:", err);
        });
    }

    if (result.fills.length > 0 || order.type === "MARKET") {
        const affectedUserIds = new Set<string>([order.userId, ...result.counterPartyUserIds]);
        for (const userId of affectedUserIds) {
            if (!BALANCES[userId]) continue;
            void publisher.publish("balance:update", JSON.stringify({
                userId,
                balances: BALANCES[userId],
            })).catch(err => console.error("Balance publish error:", err));
        }
    }
}

/** Match in-process and return immediately; persistence and WS fan-out run in the background. */
export async function executeOrder(order: MemoryOrder, stockId: string): Promise<MatchResult> {
    ORDERS.push(order);
    const result = await matchOrder(order, stockId);
    void postProcessOrder(order, stockId, result);
    return result;
}

async function processOrder(order: MemoryOrder, stockId: string) {
    const result = await executeOrder(order, stockId);
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
