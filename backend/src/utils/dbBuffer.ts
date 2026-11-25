import { prisma } from "../prisma";
import type { MemoryOrder } from "../types/order";
import { syncOrderStatus } from "./orderSync";
import { formatUnits, getAssetScale, priceToDecimalString, quantityToDecimalString } from "./precision";

export interface BalanceUpdate {
    balanceId: string;
    available: bigint;
    locked: bigint;
    symbol: string;
}

export interface DbFillRecord {
    stockId: string;
    symbol: string;
    buyOrderId: string;
    sellOrderId: string;
    price: bigint;
    quantity: bigint;
}

const orderBuffer = new Map<string, { order: MemoryOrder; stockId: string }>();
let fillBuffer: DbFillRecord[] = [];
const balanceBuffer = new Map<string, BalanceUpdate>();

let flushTimer: NodeJS.Timeout | null = null;
let activeFlushPromise: Promise<void> | null = null;

export function queueOrderUpsert(order: MemoryOrder, stockId: string) {
    syncOrderStatus(order);
    orderBuffer.set(order.id, { order: { ...order }, stockId });
    startFlushTimerIfNeeded();
}

export function queueFillsInsert(fills: DbFillRecord[]) {
    fillBuffer.push(...fills);
    startFlushTimerIfNeeded();
}

export function queueBalanceUpdate(
    balanceId: string,
    available: bigint | number,
    locked: bigint | number,
    symbol: string = "INR"
) {
    if (!balanceId) return;
    const availBi = typeof available === "bigint" ? available : BigInt(Math.round(available));
    const lockedBi = typeof locked === "bigint" ? locked : BigInt(Math.round(locked));
    balanceBuffer.set(balanceId, { balanceId, available: availBi, locked: lockedBi, symbol });
    startFlushTimerIfNeeded();
}

function startFlushTimerIfNeeded() {
    if (!flushTimer) {
        flushTimer = setTimeout(() => {
            flushTimer = null;
            void flushDbBuffer();
        }, 500);
    }
}

export async function flushDbBuffer(): Promise<void> {
    if (activeFlushPromise) {
        startFlushTimerIfNeeded();
        await activeFlushPromise;
        if (orderBuffer.size > 0 || fillBuffer.length > 0 || balanceBuffer.size > 0) {
            return flushDbBuffer();
        }
        return;
    }

    const ordersToSync = Array.from(orderBuffer.values());
    orderBuffer.clear();

    const fillsToSync = [...fillBuffer];
    fillBuffer = [];

    const balancesToSync = Array.from(balanceBuffer.values());
    balanceBuffer.clear();

    if (ordersToSync.length === 0 && fillsToSync.length === 0 && balancesToSync.length === 0) {
        return;
    }

    activeFlushPromise = (async () => {
        try {
            await prisma.$transaction(async (tx) => {
                for (const item of ordersToSync) {
                    const { order, stockId } = item;
                    const scale = getAssetScale(order.symbol);
                    await tx.order.upsert({
                        where: { id: order.id },
                        create: {
                            id: order.id,
                            userId: order.userId,
                            stockId,
                            side: order.side,
                            type: order.type,
                            status: order.status,
                            price: order.type === "LIMIT" && order.price != null
                                ? priceToDecimalString(order.price)
                                : null,
                            quantity: quantityToDecimalString(order.quantity, order.symbol),
                            filledQuantity: quantityToDecimalString(order.filledQuantity, order.symbol),
                        },
                        update: {
                            filledQuantity: quantityToDecimalString(order.filledQuantity, order.symbol),
                            status: order.status,
                        },
                    });
                }

                if (fillsToSync.length > 0) {
                    await tx.fill.createMany({
                        data: fillsToSync.map(f => ({
                            stockId: f.stockId,
                            buyOrderId: f.buyOrderId,
                            sellOrderId: f.sellOrderId,
                            price: priceToDecimalString(f.price),
                            quantity: quantityToDecimalString(f.quantity, f.symbol),
                        })),
                    });
                }

                for (const bal of balancesToSync) {
                    if (!bal.balanceId) continue;
                    const scale = getAssetScale(bal.symbol);
                    await tx.balance.update({
                        where: { id: bal.balanceId },
                        data: {
                            available: formatUnits(bal.available, scale.decimals),
                            locked: formatUnits(bal.locked, scale.decimals),
                        },
                    });
                }
            });
        } catch (err) {
            console.error("Failed to flush DB persistence buffer:", err);
            for (const item of ordersToSync) {
                if (!orderBuffer.has(item.order.id)) orderBuffer.set(item.order.id, item);
            }
            fillBuffer.unshift(...fillsToSync);
            for (const bal of balancesToSync) {
                if (!balanceBuffer.has(bal.balanceId)) balanceBuffer.set(bal.balanceId, bal);
            }
        } finally {
            activeFlushPromise = null;
            if (orderBuffer.size > 0 || fillBuffer.length > 0 || balanceBuffer.size > 0) {
                startFlushTimerIfNeeded();
            }
        }
    })();

    await activeFlushPromise;
}
