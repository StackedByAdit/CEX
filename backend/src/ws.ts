import { WebSocketServer, WebSocket } from "ws";
import { subscriber } from "./redis";
import { BALANCES, ORDERBOOK } from "./state";
import { getCandleSnapshot } from "./utils/candle";
import type { Interval } from "./utils/candle";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma";
import { getSessionTokenFromRequest } from "./utils/sessionCookie";
import { formatBalancesForPublish, formatOrderbookForPublish } from "./utils/publish";
import { lockAndQueueOrder } from "./utils/orderPlacement";

type AliveWebSocket = WebSocket & { isAlive?: boolean };

const JWT_SECRET = process.env.JWT_SECRET!;

const orderbookSubs = new Map<string, Set<WebSocket>>();
const candleSubs = new Map<string, Set<WebSocket>>();

const userSockets = new Map<string, WebSocket>();

export function initWS(port: number) {
    const wss = new WebSocketServer({ port });

    console.log(`WS server running on :${port}`);

    wss.on("connection", (ws, req) => {
        const url = new URL(req.url!, `ws://localhost:${port}`);
        const token = getSessionTokenFromRequest({
            headers: {
                authorization: url.searchParams.get("token")
                    ? `Bearer ${url.searchParams.get("token")}`
                    : undefined,
                cookie: req.headers.cookie,
            },
        });

        let userId: string | null = null;

        const socket = ws as AliveWebSocket;
        socket.isAlive = true;
        socket.on("pong", () => { socket.isAlive = true; });

        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
                userId = decoded.id;
                userSockets.set(userId, ws);
            } catch (e) {
                console.log(e)
            }
        }

        ws.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString());

                if (msg.type === "SUBSCRIBE_ORDERBOOK") {
                    const symbol = msg.symbol as string;
                    if (!orderbookSubs.has(symbol)) {
                        orderbookSubs.set(symbol, new Set());
                    }
                    orderbookSubs.get(symbol)!.add(ws);

                    const snapshot = formatOrderbookForPublish(symbol);
                    if (snapshot) {
                        ws.send(JSON.stringify({
                            type: "ORDERBOOK_SNAPSHOT",
                            symbol,
                            bids: snapshot.bids,
                            asks: snapshot.asks,
                        }));
                    }
                }

                if (msg.type === "UNSUBSCRIBE_ORDERBOOK") {
                    const symbol = msg.symbol as string;
                    orderbookSubs.get(symbol)?.delete(ws);
                }

                if (msg.type === "GET_BALANCE") {
                    if (!userId) {
                        ws.send(JSON.stringify({ type: "ERROR", message: "Unauthorized" }));
                        return;
                    }
                    const formatted = formatBalancesForPublish(userId);
                    ws.send(JSON.stringify({
                        type: "BALANCE_SNAPSHOT",
                        balances: formatted?.balances ?? {}
                    }));
                }

                if (msg.type === "SUBSCRIBE_CANDLE") {
                    const symbol = msg.symbol as string;
                    const interval = msg.interval as string;
                    const key = `${symbol}:${interval}`;

                    if (!candleSubs.has(key)) candleSubs.set(key, new Set());
                    candleSubs.get(key)!.add(ws);

                    void getCandleSnapshot(symbol, interval as Interval).then((snapshot) => {
                        if (ws.readyState !== WebSocket.OPEN) return;

                        ws.send(JSON.stringify({
                            type: "CANDLE_SNAPSHOT",
                            symbol,
                            interval,
                            candles: snapshot.candles,
                            current: snapshot.current,
                        }));
                    }).catch(err => console.error("Candle snapshot error:", err));
                }

                if (msg.type === "UNSUBSCRIBE_CANDLE") {
                    const key = `${msg.symbol}:${msg.interval}`;
                    candleSubs.get(key)?.delete(ws);
                }

                if (msg.type === "PLACE_ORDER") {
                    const reqId = msg.requestId as string | undefined;
                    if (!userId) {
                        ws.send(JSON.stringify({ type: "ERROR", requestId: reqId, message: "Unauthorized" }));
                        return;
                    }

                    const orderType = (msg.orderType || (msg.price !== undefined ? "LIMIT" : "MARKET")) as "LIMIT" | "MARKET";

                    void lockAndQueueOrder(userId, {
                        side: msg.side,
                        type: orderType,
                        symbol: msg.symbol,
                        price: msg.price,
                        quantity: msg.quantity,
                    }).then(({ orderId, estimatedQuoteNum, currOrder }) => {
                        if (ws.readyState !== WebSocket.OPEN) return;
                        ws.send(JSON.stringify({
                            type: "ORDER_ACCEPTED",
                            requestId: reqId,
                            orderId,
                            status: "PENDING",
                            symbol: currOrder.symbol,
                            side: currOrder.side,
                            orderType: currOrder.type,
                            estimatedQuote: estimatedQuoteNum,
                        }));
                    }).catch((err: any) => {
                        if (ws.readyState !== WebSocket.OPEN) return;
                        ws.send(JSON.stringify({
                            type: "ORDER_REJECTED",
                            requestId: reqId,
                            message: err?.message || "Failed to place order",
                        }));
                    });
                }

            } catch {
                ws.send(JSON.stringify({ type: "ERROR", message: "Invalid message" }));
            }
        });

        ws.on("close", () => {
            for (const subs of orderbookSubs.values()) {
                subs.delete(ws);
            }
            for (const subs of candleSubs.values()) {
                subs.delete(ws);
            }
            if (userId) {
                userSockets.delete(userId);
            }
        });
    });

    subscriber.on("message", (channel, message) => {

        if (channel.startsWith("orderbook:")) {
            const symbol = channel.split(":")[1]!;
            const subs = orderbookSubs.get(symbol);
            if (!subs) return;
            const payload = JSON.stringify({ type: "ORDERBOOK_UPDATE", ...JSON.parse(message) });
            for (const client of subs) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(payload);
                }
            }
        }

        if (channel.startsWith("trades:")) {
            const symbol = channel.split(":")[1]!;
            const subs = orderbookSubs.get(symbol);
            if (!subs) return;
            const payload = JSON.stringify({ type: "TRADE", ...JSON.parse(message) });
            for (const client of subs) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(payload);
                }
            }
        }

        if (channel === "balance:update") {
            const data = JSON.parse(message) as { userId: string; balances: Record<string, { available: number; locked: number }> };
            const client = userSockets.get(data.userId);
            if (client && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "BALANCE_UPDATE", balances: data.balances }));
            }
        }

        if (channel === "order:execution") {
            const data = JSON.parse(message) as { userId: string };
            const client = userSockets.get(data.userId);
            if (client && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "ORDER_EXECUTED", ...data }));
            }
        }

        if (channel.startsWith("candle:")) {
            const parts = channel.split(":");
            const symbol = parts[1]!;
            const raw = JSON.parse(message);
            const payload1m = JSON.stringify({ type: "CANDLE_UPDATE", ...raw });

            for (const [key, subs] of candleSubs.entries()) {
                if (!key.startsWith(`${symbol}:`)) continue;
                for (const client of subs) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(payload1m);
                    }
                }
            }
        }
    });

    setInterval(() => {
        wss.clients.forEach((client) => {
            const socket = client as AliveWebSocket;
            if (!socket.isAlive) return socket.terminate();
            socket.isAlive = false;
            socket.ping();
        });
    }, 30000);

    async function subscribeToSymbols() {
        const stocks = await prisma.stock.findMany();
        const symbols = stocks.map(s => s.symbol);
        const orderbookChannels = symbols.map(s => `orderbook:${s}`);
        const tradeChannels = symbols.map(s => `trades:${s}`);
        const candleChannels = symbols.map(s => `candle:${s}:1m`);

        await subscriber.subscribe(...orderbookChannels, ...tradeChannels, ...candleChannels, "balance:update", "order:execution");
        console.log("Subscribed to:", [...orderbookChannels, ...tradeChannels]);
    }

    subscribeToSymbols();

    subscriber.on("reconnecting", () => {
        subscribeToSymbols();
    });

}