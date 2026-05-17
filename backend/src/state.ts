import type { MemoryOrder } from "./types/order";

export const ORDERS: MemoryOrder[] = [];

export const ORDERBOOK: Record<string, { asks: Record<number, MemoryOrder[]>; bids: Record<number, MemoryOrder[]> }> = {
    AXIS: { asks: {}, bids: {} },
    SOL: { asks: {}, bids: {} },
    HDFC: { asks: {}, bids: {} },
};