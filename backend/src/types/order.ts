export type MemoryOrder = {
    id : string,
    userId : string,
    side : "BUY" | "SELL",
    type : "LIMIT" | "MARKET",
    symbol : string,
    price? : number,
    quantity : number,
    filledQuantity : number,
    status : "PENDING" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED",
    /** Total INR reserved up front for market buys. */
    lockedQuoteAmount? : number,
}