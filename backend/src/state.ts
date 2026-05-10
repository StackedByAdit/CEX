import type { MemoryOrder } from "./types/order";

export const ORDERBOOK: Record<string, {
    bids: Record<number, MemoryOrder[]>;
    asks: Record<number, MemoryOrder[]>;
}> = {
    AXIS: { bids: {}, asks: {} },
    HDFC: { bids: {}, asks: {} },
    TATA: { bids: {}, asks: {} },
};