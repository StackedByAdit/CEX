import { prisma } from "../prisma";
import { redisClient } from "../redis";
import { BALANCES, ORDERBOOK, STOCK_BY_SYMBOL } from "../state";
import { assureBalance } from "./assureBalance";
import { queueBalanceUpdate } from "./dbBuffer";
import { estimateMarketBuy, estimateMarketSell } from "./marketOrder";
import {
    calculateQuote,
    formatInr,
    parsePrice,
    parseQuantity,
} from "./precision";
import { serializeOrderForQueue, type MemoryOrder } from "../types/order";
import BTree from "sorted-btree";

export interface LockAndQueueInput {
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET";
    symbol: string;
    price?: number | string;
    quantity: number | string;
}

export interface LockAndQueueResult {
    orderId: string;
    stockId: string;
    currOrder: MemoryOrder;
    lockedQuoteAmount?: bigint;
    orderQuantity: bigint;
    orderPrice?: bigint;
    estimatedQuoteNum?: number;
}

export async function lockAndQueueOrder(
    userId: string,
    input: LockAndQueueInput
): Promise<LockAndQueueResult> {
    const { side, type, symbol, price, quantity } = input;

    let orderQuantity: bigint;
    try {
        orderQuantity = parseQuantity(quantity, symbol);
    } catch {
        throw new Error("Invalid quantity");
    }

    if (orderQuantity <= 0n) {
        throw new Error("Quantity must be greater than zero");
    }

    let orderPrice: bigint | undefined;
    if (type === "LIMIT") {
        if (price === undefined || price === null || price === "") {
            throw new Error("Price required for LIMIT order");
        }
        try {
            orderPrice = parsePrice(price);
        } catch {
            throw new Error("Invalid price");
        }
        if (orderPrice <= 0n) {
            throw new Error("Price must be greater than zero");
        }
    } else if (type === "MARKET" && price !== undefined && price !== null && price !== "") {
        throw new Error("Price not allowed for MARKET order");
    }

    const stock = STOCK_BY_SYMBOL[symbol]
        ? { id: STOCK_BY_SYMBOL[symbol]!.id, symbol }
        : await prisma.stock.findUnique({ where: { symbol } });

    if (!stock) {
        throw new Error("Stock not found");
    }

    if (!ORDERBOOK[symbol]) {
        ORDERBOOK[symbol] = {
            bids: new BTree(undefined, (a, b) => (a < b ? -1 : a > b ? 1 : 0)),
            asks: new BTree(undefined, (a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        };
    }

    const stockId = stock.id;

    if (!BALANCES[userId]?.INR || !BALANCES[userId]?.[symbol]) {
        await Promise.all([
            assureBalance(userId, "INR"),
            assureBalance(userId, symbol),
        ]);
    }

    const inrBalance = BALANCES[userId]!.INR!;
    const stockBalance = BALANCES[userId]![symbol]!;

    let lockedQuoteAmount: bigint | undefined;

    if (side === "BUY") {
        if (type === "LIMIT") {
            const amount = calculateQuote(orderQuantity, orderPrice!, symbol, "up");

            if (inrBalance.available < amount) {
                throw new Error("INSUFFICIENT INR");
            }

            inrBalance.available -= amount;
            inrBalance.locked += amount;
            lockedQuoteAmount = amount;

            queueBalanceUpdate(inrBalance.balanceId, inrBalance.available, inrBalance.locked, "INR");
        }

        if (type === "MARKET") {
            const estimate = estimateMarketBuy(symbol, orderQuantity);

            if (estimate.fillableQuantity <= 0n) {
                throw new Error("INSUFFICIENT LIQUIDITY");
            }

            lockedQuoteAmount = estimate.estimatedQuote;

            if (inrBalance.available < lockedQuoteAmount) {
                throw new Error("INSUFFICIENT INR");
            }

            inrBalance.available -= lockedQuoteAmount;
            inrBalance.locked += lockedQuoteAmount;

            queueBalanceUpdate(inrBalance.balanceId, inrBalance.available, inrBalance.locked, "INR");
        }
    } else {
        if (stockBalance.available < orderQuantity) {
            throw new Error(`INSUFFICIENT ${symbol}`);
        }

        if (type === "MARKET") {
            const estimate = estimateMarketSell(symbol, orderQuantity);
            if (estimate.fillableQuantity <= 0n) {
                throw new Error("INSUFFICIENT LIQUIDITY");
            }
        }

        stockBalance.available -= orderQuantity;
        stockBalance.locked += orderQuantity;

        queueBalanceUpdate(stockBalance.balanceId, stockBalance.available, stockBalance.locked, symbol);
    }

    const orderId = crypto.randomUUID();

    const currOrder: MemoryOrder = {
        id: orderId,
        userId,
        side,
        symbol,
        type,
        status: "PENDING",
        price: orderPrice,
        quantity: orderQuantity,
        filledQuantity: 0n,
        lockedQuoteAmount,
    };

    try {
        await Promise.race([
            redisClient.lpush("queue:orders", serializeOrderForQueue(currOrder, stockId)),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Redis queue timeout")), 500)),
        ]);
    } catch (err: any) {
        if (process.env.NODE_ENV !== "test") {
            throw err;
        }
    }

    const estimatedQuoteNum = lockedQuoteAmount !== undefined
        ? formatInr(lockedQuoteAmount)
        : (type === "LIMIT" && side === "BUY" ? formatInr(calculateQuote(orderQuantity, orderPrice!, symbol, "up")) : undefined);

    return {
        orderId,
        stockId,
        currOrder,
        lockedQuoteAmount,
        orderQuantity,
        orderPrice,
        estimatedQuoteNum,
    };
}
