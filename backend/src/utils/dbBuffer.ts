import { prisma } from "../prisma";
import type { MemoryOrder } from "../types/order";
import { syncOrderStatus } from "./orderSync";

interface BalanceUpdate {
    balanceId: string;
    available: number;
    locked: number;
}

// In-memory queues
const orderBuffer = new Map<string, { order: MemoryOrder; stockId: string }>();
let fillBuffer: { stockId: string; buyOrderId: string; sellOrderId: string; price: number; quantity: number }[] = [];
const balanceBuffer = new Map<string, BalanceUpdate>();

let flushTimer: NodeJS.Timeout | null = null;
let activeFlushPromise: Promise<void> | null = null;

export function queueOrderUpsert(order: MemoryOrder, stockId: string) {
    syncOrderStatus(order);
    orderBuffer.set(order.id, { order: { ...order }, stockId });
    startFlushTimerIfNeeded();
}

export function queueFillsInsert(fills: { stockId: string; buyOrderId: string; sellOrderId: string; price: number; quantity: number }[]) {
    fillBuffer.push(...fills);
    startFlushTimerIfNeeded();
}

export function queueBalanceUpdate(balanceId: string, available: number, locked: number) {
    balanceBuffer.set(balanceId, { balanceId, available, locked });
    startFlushTimerIfNeeded();
}

function startFlushTimerIfNeeded() {
    if (!flushTimer) {
        flushTimer = setTimeout(() => {
            flushTimer = null;
            void flushDbBuffer();
        }, 500); // Flush every 500ms
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
                // 1. Bulk Upsert Orders
                for (const item of ordersToSync) {
                    const { order, stockId } = item;
                    await tx.order.upsert({
                        where: { id: order.id },
                        create: {
                            id: order.id,
                            userId: order.userId,
                            stockId,
                            side: order.side,
                            type: order.type,
                            status: order.status,
                            price: order.type === "LIMIT" ? order.price! : null,
                            quantity: order.quantity,
                            filledQuantity: order.filledQuantity,
                        },
                        update: {
                            filledQuantity: order.filledQuantity,
                            status: order.status,
                        },
                    });
                }

                // 2. Bulk Insert Fills
                if (fillsToSync.length > 0) {
                    await tx.fill.createMany({
                        data: fillsToSync,
                    });
                }

                // 3. Bulk Update Balances
                for (const bal of balancesToSync) {
                    await tx.balance.update({
                        where: { id: bal.balanceId },
                        data: {
                            available: bal.available,
                            locked: bal.locked,
                        },
                    });
                }
            });
        } catch (err) {
            console.error("Failed to flush DB persistence buffer:", err);
            // Re-queue snapshotted work so it isn't lost; existing buffer entries win (newer state).
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
