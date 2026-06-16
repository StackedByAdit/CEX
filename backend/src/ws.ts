import { WebSocketServer, WebSocket } from "ws";
import { subscriber } from "./redis";
import { BALANCES, ORDERBOOK } from "./state";
import { getCandleSnapshot } from "./utils/candle";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma";
import { getSessionTokenFromRequest } from "./utils/sessionCookie";

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

                    const firm = ORDERBOOK[symbol];
                    if (firm) {
                        ws.send(JSON.stringify({
                            type: "ORDERBOOK_SNAPSHOT",
                            symbol,
                            bids: firm.bids,
                            asks: firm.asks,
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
                    ws.send(JSON.stringify({
                        type: "BALANCE_SNAPSHOT",
                        balances: BALANCES[userId] ?? {}
                    }));
                }

                if (msg.type === "SUBSCRIBE_CANDLE") {
                    const symbol = msg.symbol as string;
                    const interval = msg.interval as string;
                    const key = `${symbol}:${interval}`;

                    if (!candleSubs.has(key)) candleSubs.set(key, new Set());
                    candleSubs.get(key)!.add(ws);

                    void getCandleSnapshot(symbol, interval as import("./utils/candle").Interval).then((snapshot) => {
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

        if (channel.startsWith("candle:")) {
            const [, symbol, interval] = channel.split(":");
            const subs = candleSubs.get(`${symbol}:${interval}`);
            if (!subs) return;
            const payload = JSON.stringify({ type: "CANDLE_UPDATE", ...JSON.parse(message) });
            for (const client of subs) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(payload);
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
        const candleChannels = symbols.flatMap(s =>
            ["1m", "5m", "15m", "1h", "4h", "1d"].map(i => `candle:${s}:${i}`)
        );

        await subscriber.subscribe(...orderbookChannels, ...tradeChannels, ...candleChannels, "balance:update");
        console.log("Subscribed to:", [...orderbookChannels, ...tradeChannels]);
    }

    subscribeToSymbols();

    subscriber.on("reconnecting", () => {
        subscribeToSymbols();
    });

}