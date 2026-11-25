import { ORDERBOOK } from "../state";
import type { MemoryOrder } from "../types/order";
import { getBalance } from "./assureBalance";
import { calculateQuote, formatPrice, formatQuantity, formatInr } from "./precision";

export interface MatchFillRecord {
    buyOrderId: string;
    sellOrderId: string;
    price: bigint;
    quantity: bigint;
}

export interface MatchResult {
    status: MemoryOrder["status"];
    filledQuantity: bigint;
    fills: { price: bigint; quantity: bigint }[];
    fillRecords: MatchFillRecord[];
    counterPartyOrders: MemoryOrder[];
    counterPartyUserIds: string[];
    actualQuote: bigint; // in INR paise
    refundQuote: bigint; // in INR paise
}

export interface JsonMatchResult {
    status: MemoryOrder["status"];
    filledQuantity: number;
    fills: { price: number; quantity: number }[];
    actualQuote: number;
    refundQuote: number;
}

export function serializeMatchResultToJson(result: MatchResult, symbol: string): JsonMatchResult {
    return {
        status: result.status,
        filledQuantity: formatQuantity(result.filledQuantity, symbol),
        fills: result.fills.map(f => ({
            price: formatPrice(f.price),
            quantity: formatQuantity(f.quantity, symbol),
        })),
        actualQuote: formatInr(result.actualQuote),
        refundQuote: formatInr(result.refundQuote),
    };
}

function trackCounterParty(
    counterPartyOrders: Map<string, MemoryOrder>,
    counterPartyUserIds: string[],
    order: MemoryOrder,
) {
    counterPartyOrders.set(order.id, order);
    counterPartyUserIds.push(order.userId);
}

export function matchOrder(order: MemoryOrder, _stockId: string): MatchResult {
    const counterPartyUserIds: string[] = [];
    const counterPartyOrders = new Map<string, MemoryOrder>();
    const fillRecords: MatchFillRecord[] = [];
    const firm = ORDERBOOK[order.symbol];
    if (!firm) {
        return {
            status: order.status,
            filledQuantity: order.filledQuantity,
            fills: [],
            fillRecords: [],
            counterPartyOrders: [],
            counterPartyUserIds: [],
            actualQuote: 0n,
            refundQuote: 0n,
        };
    }

    const fills: { price: bigint; quantity: bigint }[] = [];

    if (order.side === "BUY") {

        for (const [price, ordersAtPrice] of firm.asks.entries()) {

            if (order.type === "LIMIT" && price > order.price!) break;
            if (!ordersAtPrice) continue;

            while (ordersAtPrice.length > 0 && order.filledQuantity < order.quantity) {

                const sellOrder = ordersAtPrice[0]!;
                const remainingBuy = order.quantity - order.filledQuantity;
                const remainingSell = sellOrder.quantity - sellOrder.filledQuantity;
                const tradeQty = remainingBuy < remainingSell ? remainingBuy : remainingSell;

                trackCounterParty(counterPartyOrders, counterPartyUserIds, sellOrder);

                order.filledQuantity += tradeQty;
                sellOrder.filledQuantity += tradeQty;

                const tradeQuote = calculateQuote(tradeQty, price, order.symbol, "half_up");
                const sellerStock = getBalance(sellOrder.userId, order.symbol);
                const sellerInr = getBalance(sellOrder.userId, "INR");
                const buyerStock = getBalance(order.userId, order.symbol);
                const buyerInr = getBalance(order.userId, "INR");

                // Debit/Credit settlement in atomic units
                buyerInr.locked -= tradeQuote;
                buyerStock.available += tradeQty;
                sellerStock.locked -= tradeQty;
                sellerInr.available += tradeQuote;

                fillRecords.push({
                    buyOrderId: order.id,
                    sellOrderId: sellOrder.id,
                    price,
                    quantity: tradeQty,
                });
                fills.push({ price, quantity: tradeQty });

                if (sellOrder.filledQuantity === sellOrder.quantity) {
                    sellOrder.status = "FILLED";
                    ordersAtPrice.shift();
                } else if (sellOrder.filledQuantity > 0n) {
                    sellOrder.status = "PARTIALLY_FILLED";
                }

                if (order.filledQuantity === order.quantity) break;
            }

            if (ordersAtPrice.length === 0) firm.asks.delete(price);
            if (order.filledQuantity === order.quantity) break;
        }

    } else {

        for (const [price, ordersAtPrice] of firm.bids.entriesReversed()) {

            if (order.type === "LIMIT" && price < order.price!) break;
            if (!ordersAtPrice) continue;

            while (ordersAtPrice.length > 0 && order.filledQuantity < order.quantity) {

                const buyOrder = ordersAtPrice[0]!;
                const remainingSell = order.quantity - order.filledQuantity;
                const remainingBuy = buyOrder.quantity - buyOrder.filledQuantity;
                const tradeQty = remainingSell < remainingBuy ? remainingSell : remainingBuy;

                trackCounterParty(counterPartyOrders, counterPartyUserIds, buyOrder);

                order.filledQuantity += tradeQty;
                buyOrder.filledQuantity += tradeQty;

                const tradeQuote = calculateQuote(tradeQty, price, order.symbol, "half_up");
                const buyerStock = getBalance(buyOrder.userId, order.symbol);
                const buyerInr = getBalance(buyOrder.userId, "INR");
                const sellerStock = getBalance(order.userId, order.symbol);
                const sellerInr = getBalance(order.userId, "INR");

                // Debit/Credit settlement in atomic units
                buyerInr.locked -= tradeQuote;
                buyerStock.available += tradeQty;
                sellerStock.locked -= tradeQty;
                sellerInr.available += tradeQuote;

                fillRecords.push({
                    buyOrderId: buyOrder.id,
                    sellOrderId: order.id,
                    price,
                    quantity: tradeQty,
                });
                fills.push({ price, quantity: tradeQty });

                if (buyOrder.filledQuantity === buyOrder.quantity) {
                    buyOrder.status = "FILLED";
                    ordersAtPrice.shift();

                    if (buyOrder.lockedQuoteAmount !== undefined) {
                        const makerSurplus = buyOrder.lockedQuoteAmount > tradeQuote
                            ? buyOrder.lockedQuoteAmount - tradeQuote
                            : 0n;
                        if (makerSurplus > 0n) {
                            buyerInr.locked -= makerSurplus;
                            buyerInr.available += makerSurplus;
                        }
                        buyOrder.lockedQuoteAmount = undefined;
                    }
                } else if (buyOrder.filledQuantity > 0n) {
                    buyOrder.status = "PARTIALLY_FILLED";
                    if (buyOrder.lockedQuoteAmount !== undefined) {
                        buyOrder.lockedQuoteAmount = buyOrder.lockedQuoteAmount > tradeQuote
                            ? buyOrder.lockedQuoteAmount - tradeQuote
                            : 0n;
                    }
                }

                if (order.filledQuantity === order.quantity) break;
            }

            if (ordersAtPrice.length === 0) firm.bids.delete(price);
            if (order.filledQuantity === order.quantity) break;
        }
    }

    // If limit order has unfilled quantity, place remaining on resting book
    if (order.filledQuantity < order.quantity && order.type === "LIMIT") {
        const bookSide = order.side === "BUY" ? firm.bids : firm.asks;
        let ordersAtPrice = bookSide.get(order.price!);
        if (!ordersAtPrice) {
            ordersAtPrice = [];
            bookSide.set(order.price!, ordersAtPrice);
        }
        ordersAtPrice.push(order);
    }

    const actualQuote = fills.reduce(
        (sum, fill) => sum + calculateQuote(fill.quantity, fill.price, order.symbol, "half_up"),
        0n
    );
    let refundQuote = 0n;

    if (order.side === "BUY") {
        const locked = order.lockedQuoteAmount ?? 0n;
        if (order.type === "MARKET") {
            refundQuote = locked > actualQuote ? locked - actualQuote : 0n;

            if (refundQuote > 0n) {
                const buyerInr = getBalance(order.userId, "INR");
                buyerInr.locked -= refundQuote;
                buyerInr.available += refundQuote;
            }

            order.lockedQuoteAmount = undefined;
        } else if (order.type === "LIMIT") {
            const unfilledQty = order.quantity - order.filledQuantity;
            const remainingLockedNeeded = unfilledQty > 0n && order.price !== undefined
                ? calculateQuote(unfilledQty, order.price, order.symbol, "up")
                : 0n;

            if (locked > 0n) {
                const totalUtilized = actualQuote + remainingLockedNeeded;
                refundQuote = locked > totalUtilized ? locked - totalUtilized : 0n;
                if (refundQuote > 0n) {
                    const buyerInr = getBalance(order.userId, "INR");
                    buyerInr.locked -= refundQuote;
                    buyerInr.available += refundQuote;
                }
                order.lockedQuoteAmount = remainingLockedNeeded > 0n ? remainingLockedNeeded : undefined;
            }
        }
    } else {
        if (order.type === "MARKET") {
            const unfilledQty = order.quantity - order.filledQuantity;
            if (unfilledQty > 0n) {
                const sellerStock = getBalance(order.userId, order.symbol);
                sellerStock.locked -= unfilledQty;
                sellerStock.available += unfilledQty;
            }
        }
    }

    if (order.type === "MARKET") {
        order.status = order.filledQuantity > 0n ? "FILLED" : "CANCELLED";
    } else if (order.filledQuantity === order.quantity) {
        order.status = "FILLED";
    } else if (order.filledQuantity > 0n) {
        order.status = "PARTIALLY_FILLED";
    } else {
        order.status = "PENDING";
    }

    return {
        status: order.status,
        filledQuantity: order.filledQuantity,
        fills,
        fillRecords,
        counterPartyOrders: Array.from(counterPartyOrders.values()),
        counterPartyUserIds,
        actualQuote,
        refundQuote,
    };
}
