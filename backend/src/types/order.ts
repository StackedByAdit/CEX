export type MemoryOrder = {
    id: string;
    userId: string;
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET";
    symbol: string;
    price?: bigint;              // Price in INR paise (2 decimals)
    quantity: bigint;           // Quantity in base atomic units
    filledQuantity: bigint;     // Filled quantity in base atomic units
    status: "PENDING" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED";
    lockedQuoteAmount?: bigint; // Locked quote amount in INR paise
};

export interface SerializedOrderPacket {
    id: string;
    userId: string;
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET";
    symbol: string;
    stockId: string;
    price?: string;
    quantity: string;
    filledQuantity: string;
    status: MemoryOrder["status"];
    lockedQuoteAmount?: string;
}

export function serializeOrderForQueue(order: MemoryOrder, stockId: string): string {
    const packet: SerializedOrderPacket = {
        id: order.id,
        userId: order.userId,
        side: order.side,
        type: order.type,
        symbol: order.symbol,
        stockId,
        price: order.price !== undefined ? order.price.toString() : undefined,
        quantity: order.quantity.toString(),
        filledQuantity: order.filledQuantity.toString(),
        status: order.status,
        lockedQuoteAmount: order.lockedQuoteAmount !== undefined ? order.lockedQuoteAmount.toString() : undefined,
    };
    return JSON.stringify(packet);
}

export function deserializeOrderFromQueue(raw: string): { order: MemoryOrder; stockId: string } {
    const packet = JSON.parse(raw) as SerializedOrderPacket;
    const order: MemoryOrder = {
        id: packet.id,
        userId: packet.userId,
        side: packet.side,
        type: packet.type,
        symbol: packet.symbol,
        price: packet.price !== undefined ? BigInt(packet.price) : undefined,
        quantity: BigInt(packet.quantity),
        filledQuantity: BigInt(packet.filledQuantity),
        status: packet.status,
        lockedQuoteAmount: packet.lockedQuoteAmount !== undefined ? BigInt(packet.lockedQuoteAmount) : undefined,
    };
    return { order, stockId: packet.stockId };
}
