import type { MemoryOrder } from "./types/order";
import BTree from "sorted-btree";

export const ORDERS: MemoryOrder[] = [];

export interface BalanceRecord {
    available: bigint; // In atomic units (paise for INR, lamports for SOL, units for shares)
    locked: bigint;
    balanceId: string;
}

export const BALANCES: Record<string, Record<string, BalanceRecord>> = {};

function createOrderTree(): BTree<bigint, MemoryOrder[]> {
    return new BTree<bigint, MemoryOrder[]>(undefined, (a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export const ORDERBOOK: Record<string, { asks: BTree<bigint, MemoryOrder[]>; bids: BTree<bigint, MemoryOrder[]> }> = {
    AXIS: { asks: createOrderTree(), bids: createOrderTree() },
    SOL: { asks: createOrderTree(), bids: createOrderTree() },
    HDFC: { asks: createOrderTree(), bids: createOrderTree() },
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

export const STOCK_BY_SYMBOL: Record<string, { id: string }> = {};
