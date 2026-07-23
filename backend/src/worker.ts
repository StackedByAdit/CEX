import { redisClient, publisher, workerClient } from "./redis";
import { matchOrder, type MatchResult } from "./utils/matchOrder";
import { ORDERS, BALANCES } from "./state";
import { prisma } from "./prisma";
import type { MemoryOrder } from "./types/order";
import { processTrade, processTradesBatch } from "./utils/candle";
import { publishBalance, publishOrderbook } from "./utils/publish";
import { queueOrderUpsert, queueFillsInsert, queueBalanceUpdate } from "./utils/dbBuffer";

function persistMatchResult(order: MemoryOrder, stockId: string, result: MatchResult) {
    for (const counterParty of result.counterPartyOrders) {
        queueOrderUpsert(counterParty, stockId);
    }

    queueOrderUpsert(order, stockId);

    if (result.fillRecords.length > 0) {
        queueFillsInsert(result.fillRecords.map(fill => ({
            stockId,
            buyOrderId: fill.buyOrderId,
            sellOrderId: fill.sellOrderId,
            price: fill.price,
            quantity: fill.quantity,
        })));
    }

    const affectedUsers = new Set<string>([order.userId, ...result.counterPartyUserIds]);
    for (const userId of affectedUsers) {
        const userBalances = BALANCES[userId];
        if (!userBalances) continue;

        if (userBalances.INR) {
            queueBalanceUpdate(userBalances.INR.balanceId, userBalances.INR.available, userBalances.INR.locked);
        }

        const symbol = order.symbol;
        if (userBalances[symbol]) {
            queueBalanceUpdate(userBalances[symbol].balanceId, userBalances[symbol].available, userBalances[symbol].locked);
        }
    }
}

function publishMatchEvents(order: MemoryOrder, stockId: string, result: MatchResult) {
    publishOrderbook(order.symbol);

    for (const fill of result.fills) {
        void publisher.publish(`trades:${order.symbol}`, JSON.stringify({
            symbol: order.symbol,
            price: fill.price,
            quantity: fill.quantity,
            timestamp: Date.now(),
        })).catch(err => console.error("Trade publish error:", err));
    }

    if (result.fills.length > 0) {
        void processTradesBatch(order.symbol, result.fills, Date.now()).catch(err => {
            console.error("Candle batch processing error:", err);
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

/** Match in-process, persist to DB, then fan out WS events. */
export async function executeOrder(order: MemoryOrder, stockId: string): Promise<MatchResult> {
    ORDERS.push(order);
    const result = matchOrder(order, stockId);
    
    // Run DB sync via queueing
    persistMatchResult(order, stockId, result);

    publishMatchEvents(order, stockId, result);
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
