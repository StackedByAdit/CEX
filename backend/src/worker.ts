import { redisClient, publisher, workerClient } from "./redis";
import { matchOrder, type MatchResult } from "./utils/matchOrder";
import { ORDERS, BALANCES } from "./state";
import { prisma } from "./prisma";
import type { MemoryOrder } from "./types/order";
import { processTrade } from "./utils/candle";
import { upsertOrder } from "./utils/orderSync";
import { publishBalance, publishOrderbook } from "./utils/publish";

async function persistMatchResult(order: MemoryOrder, stockId: string, result: MatchResult) {
    for (const counterParty of result.counterPartyOrders) {
        await upsertOrder(counterParty, stockId);
    }

    await upsertOrder(order, stockId);

    for (const fill of result.fillRecords) {
        await prisma.fill.create({
            data: {
                stockId,
                buyOrderId: fill.buyOrderId,
                sellOrderId: fill.sellOrderId,
                price: fill.price,
                quantity: fill.quantity,
            },
        });
    }
}

function postProcessOrder(order: MemoryOrder, stockId: string, result: MatchResult) {
    void persistMatchResult(order, stockId, result).catch(err => {
        console.error("DB sync error (persist match):", err);
    });

    publishOrderbook(order.symbol);

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
            publishBalance(userId);
        }
    }
}

/** Match in-process and return immediately; persistence and WS fan-out run in the background. */
export function executeOrder(order: MemoryOrder, stockId: string): MatchResult {
    ORDERS.push(order);
    const result = matchOrder(order, stockId);
    postProcessOrder(order, stockId, result);
    return result;
}

async function processOrder(order: MemoryOrder, stockId: string) {
    const result = executeOrder(order, stockId);
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
