import { redisClient, publisher } from "./redis";
import { ORDERBOOK, ORDERS } from "./state";
import type { MemoryOrder } from "./types/order";


async function processOrder(order : MemoryOrder) {
    
    if(!ORDERBOOK[order.symbol]){
        ORDERBOOK[order.symbol] = { bids : {}, asks : {}};
    }
    ORDERS.push(order);
}