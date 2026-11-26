import { redisClient, publisher, workerClient } from "./redis";
import { matchOrder, serializeMatchResultToJson, type MatchResult } from "./utils/matchOrder";
import { ORDERS, BALANCES } from "./state";
import { deserializeOrderFromQueue, type MemoryOrder } from "./types/order";
import { processTradesBatch } from "./utils/candle";
import { publishBalance, publishOrderbook } from "./utils/publish";
import { queueOrderUpsert, queueFillsInsert, queueBalanceUpdate } from "./utils/dbBuffer";
import { formatInr, formatPrice, formatQuantity } from "./utils/precision";

function persistMatchResult(order: MemoryOrder, stockId: string, result: MatchResult) {
    for (const counterParty of result.counterPartyOrders) {
        queueOrderUpsert(counterParty, stockId);
    }

    queueOrderUpsert(order, stockId);

    if (result.fillRecords.length > 0) {
        queueFillsInsert(result.fillRecords.map(fill => ({
            stockId,
            symbol: order.symbol,
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
            queueBalanceUpdate(userBalances.INR.balanceId, userBalances.INR.available, userBalances.INR.locked, "INR");
        }

        const symbol = order.symbol;
        if (userBalances[symbol]) {
            queueBalanceUpdate(userBalances[symbol].balanceId, userBalances[symbol].available, userBalances[symbol].locked, symbol);
        }
    }
}

function publishMatchEvents(order: MemoryOrder, stockId: string, result: MatchResult) {
    publishOrderbook(order.symbol);

    for (const fill of result.fills) {
        void publisher.publish(`trades:${order.symbol}`, JSON.stringify({
            symbol: order.symbol,
            price: formatPrice(fill.price),
            quantity: formatQuantity(fill.quantity, order.symbol),
            timestamp: Date.now(),
        })).catch(err => console.error("Trade publish error:", err));
    }

    if (result.fills.length > 0) {
        const numericFills = result.fills.map(f => ({
            price: formatPrice(f.price),
            quantity: formatQuantity(f.quantity, order.symbol),
        }));
        void processTradesBatch(order.symbol, numericFills, Date.now()).catch(err => {
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

    void publisher.publish("order:execution", JSON.stringify({
        userId: order.userId,
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
        status: result.status,
        filledQuantity: formatQuantity(result.filledQuantity, order.symbol),
        fills: result.fills.map(f => ({
            price: formatPrice(f.price),
            quantity: formatQuantity(f.quantity, order.symbol),
        })),
        actualQuote: formatInr(result.actualQuote),
        refundQuote: formatInr(result.refundQuote),
    })).catch(err => console.error("Order execution publish error:", err));
}

export async function executeOrder(order: MemoryOrder, stockId: string): Promise<MatchResult> {
    ORDERS.push(order);
    const result = matchOrder(order, stockId);

    persistMatchResult(order, stockId, result);
    publishMatchEvents(order, stockId, result);
    return result;
}

async function processOrder(order: MemoryOrder, stockId: string) {
    const result = await executeOrder(order, stockId);
    const jsonResult = serializeMatchResultToJson(result, order.symbol);
    await redisClient.lpush(`result:${order.id}`, JSON.stringify(jsonResult));
    await redisClient.expire(`result:${order.id}`, 10);
    console.log("Result pushed for:", order.id);
}

export async function runWorker() {
    console.log("Worker running...");
    while (true) {
        try {
            const res = await workerClient.brpop("queue:orders", 0);
            if (!res) continue;
            const { order, stockId } = deserializeOrderFromQueue(res[1]);
            await processOrder(order, stockId);
        } catch (err) {
            console.error("Worker processing error:", err);
        }
    }
}
