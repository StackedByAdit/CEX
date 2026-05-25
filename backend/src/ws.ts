import { WebSocketServer, WebSocket } from "ws";
import { subscriber } from "./redis";
import { BALANCES, ORDERBOOK } from "./state";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

const orderbookSubs = new Map<string, Set<WebSocket>>();

const userSockets = new Map<string, WebSocket>();

export function initWS(port: number) {
    const wss = new WebSocketServer({ port });

    console.log(`WS server running on :${port}`);

    wss.on("connection", (ws, req) => {
        const url = new URL(req.url!, `ws://localhost:${port}`);
        const token = url.searchParams.get("token");

        let userId: string | null = null;

        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
                userId = decoded.id;
                userSockets.set(userId, ws);
            } catch(e) {
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

            } catch {
                ws.send(JSON.stringify({ type: "ERROR", message: "Invalid message" }));
            }
        });

        ws.on("close", () => {
            for (const subs of orderbookSubs.values()) {
                subs.delete(ws);
            }
            if (userId) {
                userSockets.delete(userId);
            }
        });
    });

    subscriber.subscribe("orderbook:AXIS", "orderbook:SOL", "orderbook:HDFC");
    subscriber.subscribe("trades:AXIS", "trades:SOL", "trades:HDFC");
    subscriber.subscribe("balance:update");

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
    });
}