import type { MemoryOrder } from "./types/order";
import BTree from "sorted-btree";

export const ORDERS: MemoryOrder[] = [];

export const BALANCES: Record<string, Record<string, { available: number, locked: number, balanceId: string }>> = {};

export const ORDERBOOK: Record<string, { asks: BTree<number, MemoryOrder[]>; bids: BTree<number, MemoryOrder[]> }> = {
    AXIS: { asks: new BTree(), bids: new BTree() },
    SOL: { asks: new BTree(), bids: new BTree() },
    HDFC: { asks: new BTree(), bids: new BTree() },
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
