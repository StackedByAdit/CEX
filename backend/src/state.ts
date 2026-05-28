import type { MemoryOrder } from "./types/order";

export const ORDERS: MemoryOrder[] = [];

export const BALANCES: Record<string, Record<string, { available: number, locked: number, balanceId: string }>> = {};

export const ORDERBOOK: Record<string, { asks: Record<number, MemoryOrder[]>; bids: Record<number, MemoryOrder[]> }> = {
    AXIS: { asks: {}, bids: {} },
    SOL: { asks: {}, bids: {} },
    HDFC: { asks: {}, bids: {} },
};

export const CANDLES: Record<string, {
    symbol: string;
    interval: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    startTime: number;
}> = {};