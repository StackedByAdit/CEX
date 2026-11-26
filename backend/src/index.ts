import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import BTree from "sorted-btree";
import { prisma } from "./prisma";
import { AssetType } from "../generated/prisma/client";
import type { OrderStatus } from "../generated/prisma/client";
const express = require("express");
const app = express();
app.use(express.json());
import { initWS } from "./ws";


import jwt from "jsonwebtoken";

import { loginSchema, orderSchema, signupSchema } from "./schemas/zodSchema";
import { serializeOrderForQueue, type MemoryOrder } from "./types/order";
import {
    calculateQuote,
    formatInr,
    formatPrice,
    formatQuantity,
    getAssetScale,
    parsePrice,
    parseQuantity,
    parseUnits,
    unitsToNumber,
} from "./utils/precision";
import { authMiddleware, type CustomRequest } from "./middleware/authMiddleware";
import { assureBalance } from "./utils/assureBalance";
import { ORDERS, ORDERBOOK, BALANCES, CANDLES, STOCK_BY_SYMBOL } from "./state";
import { advanceCandlesIfNeeded, getCandleSnapshot } from "./utils/candle";
import { estimateMarketBuy, estimateMarketSell } from "./utils/marketOrder";
import { restoreOpenOrders } from "./utils/orderSync";
import { formatBalancesForPublish, publishBalance, publishOrderbook } from "./utils/publish";
import { getTickerStats } from "./utils/ticker";
import { lockAndQueueOrder } from "./utils/orderPlacement";
import { runWorker } from "./worker";
import { redisClient, resultClient } from "./redis";
import { flushDbBuffer, queueBalanceUpdate, queueOrderUpsert } from "./utils/dbBuffer";
import {
    buildClearCookieHeader,
    buildSetCookieHeader,
    sessionCookieOptions,
    SESSION_COOKIE_NAME,
} from "./utils/sessionCookie";
const PORT = Number(process.env.PORT) || 3000;
const WS_PORT = Number(process.env.WS_PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";

const JWT_SECRET = process.env.JWT_SECRET!;

app.post("/signup", async (req: Request, res: Response) => {

    const result = signupSchema.safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({
            msg: "Invalid input",
            errors: result.error.issues,
        });
    }

    const { username, password } = result.data;

    try {

        const existingUser = await prisma.user.findUnique({
            where: { username }
        });

        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: { username, password: hashedPassword }
        });

        const stocks = await prisma.stock.findMany();

        await Promise.all(
            stocks.map(async stock => {
                const balance = await prisma.balance.create({
                    data: {
                        userId: newUser.id,
                        assetType: AssetType.STOCK,
                        stockId: stock.id,
                        available: 0,
                        locked: 0
                    }
                });
                if (!BALANCES[newUser.id]) BALANCES[newUser.id] = {};

                BALANCES[newUser.id]![stock.symbol] = {
                    available: 0n,
                    locked: 0n,
                    balanceId: balance.id
                };
            })
        );

        const inrBalance = await prisma.balance.create({
            data: {
                userId: newUser.id,
                assetType: AssetType.INR,
                available: 0,
                locked: 0
            }
        });

        BALANCES[newUser.id]!["INR"] = {
            available: 0n,
            locked: 0n,
            balanceId: inrBalance.id
        };

        return res.json({
            message: "User created",
            userId: newUser.id
        });

    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/login", async (req: Request, res: Response) => {

    try {

        const result = loginSchema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({
                message: "Invalid input",
                error: result.error.issues
            });
        }

        const { username, password } = result.data;

        const user = await prisma.user.findUnique({ where: { username } });

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isCorrect = await bcrypt.compare(password, user.password);

        if (!isCorrect) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
        );

        const cookieOptions = sessionCookieOptions();
        res.setHeader(
            "Set-Cookie",
            buildSetCookieHeader(SESSION_COOKIE_NAME, token, cookieOptions),
        );

        return res.status(200).json({
            message: "Login successful",
            username: user.username,
            token,
        });

    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/logout", (_req: Request, res: Response) => {
    const cookieOptions = sessionCookieOptions();
    res.setHeader(
        "Set-Cookie",
        buildClearCookieHeader(SESSION_COOKIE_NAME, cookieOptions),
    );

    return res.status(200).json({ message: "Logged out" });
});

app.post("/deposit", authMiddleware, async (req: CustomRequest, res: Response) => {

    const { amount, symbol } = req.body;
    const assetSymbol = symbol && typeof symbol === "string" ? symbol.toUpperCase() : "INR";

    if (assetSymbol !== "INR" && !STOCK_BY_SYMBOL[assetSymbol]) {
        return res.status(400).json({ message: "Stock not found" });
    }

    const scale = getAssetScale(assetSymbol);
    let depositAmount: bigint;
    try {
        depositAmount = parseUnits(amount, scale.decimals);
    } catch {
        return res.status(400).json({ message: "Invalid deposit amount" });
    }

    const MAX_DEPOSIT_UNITS = 100_000_000_000n * (10n ** BigInt(scale.decimals));
    if (depositAmount <= 0n || depositAmount > MAX_DEPOSIT_UNITS) {
        return res.status(400).json({ message: "Invalid deposit amount" });
    }

    const userId = req.id!;

    try {
        const balance = await assureBalance(userId, assetSymbol);
        balance.available += depositAmount;

        queueBalanceUpdate(balance.balanceId, balance.available, balance.locked, assetSymbol);
        publishBalance(userId);
        await flushDbBuffer();

        const formatted = formatBalancesForPublish(userId);

        return res.status(200).json({
            message: "Deposit successful",
            symbol: assetSymbol,
            available: unitsToNumber(balance.available, scale.decimals),
            balances: formatted?.balances ?? {},
        });
    } catch (err: any) {
        if (err?.message?.startsWith("Stock not found")) {
            return res.status(400).json({ message: "Stock not found" });
        }
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/order", authMiddleware, async (req: CustomRequest, res: Response) => {

    const order = orderSchema.safeParse(req.body);

    if (!order.success) {
        return res.status(400).json({ message: order.error.issues[0]?.message ?? "invalid order" });
    }

    try {
        const { orderId, orderQuantity, estimatedQuoteNum } = await lockAndQueueOrder(req.id!, order.data);

        const rawResult = await resultClient.brpop(`result:${orderId}`, 5);
        if (!rawResult) {
            return res.status(504).json({ message: "Order processing timeout" });
        }
        const result = JSON.parse(rawResult[1]);

        const filledQuantityBi = parseQuantity(result.filledQuantity, order.data.symbol);
        const remainingBi = orderQuantity > filledQuantityBi ? orderQuantity - filledQuantityBi : 0n;

        return res.status(200).json({
            orderId,
            status: result.status,
            filledQuantity: result.filledQuantity,
            remainingQuantity: formatQuantity(remainingBi, order.data.symbol),
            fills: result.fills,
            actualQuote: result.actualQuote,
            refundQuote: result.refundQuote,
            estimatedQuote: estimatedQuoteNum,
        });
    } catch (err: any) {
        if (err.message === "Stock not found") {
            return res.status(404).json({ message: "Stock not found" });
        }
        return res.status(400).json({ message: err.message || "Invalid order" });
    }
});

app.delete("/order/:orderId", authMiddleware, async (req: CustomRequest, res: Response) => {

    const orderId = req.params.orderId as string;

    await flushDbBuffer();

    let order = ORDERS.find(entry => entry.id === orderId);

    if (!order) {
        const dbOrder = await prisma.order.findUnique({
            where: { id: orderId },
            include: { stock: true },
        });

        if (!dbOrder) {
            return res.status(404).json({ message: "Order not found" });
        }

        if (dbOrder.userId !== req.id) {
            return res.status(403).json({ message: "Not your order" });
        }

        if (
            dbOrder.type !== "LIMIT" ||
            dbOrder.price == null ||
            (dbOrder.status !== "PENDING" && dbOrder.status !== "PARTIALLY_FILLED")
        ) {
            return res.status(400).json({ message: "Order cannot be cancelled" });
        }

        const newOrder: MemoryOrder = {
            id: dbOrder.id,
            userId: dbOrder.userId,
            side: dbOrder.side,
            type: dbOrder.type,
            symbol: dbOrder.stock.symbol,
            price: parsePrice(dbOrder.price.toString()),
            quantity: parseQuantity(dbOrder.quantity.toString(), dbOrder.stock.symbol),
            filledQuantity: parseQuantity(dbOrder.filledQuantity.toString(), dbOrder.stock.symbol),
            status: dbOrder.status,
        };

        ORDERS.push(newOrder);

        if (!ORDERBOOK[newOrder.symbol]) {
            ORDERBOOK[newOrder.symbol] = {
            bids: new BTree(undefined, (a, b) => (a < b ? -1 : a > b ? 1 : 0)),
            asks: new BTree(undefined, (a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        };
        }
        const firm = ORDERBOOK[newOrder.symbol]!;
        const bookSide = newOrder.side === "BUY" ? firm.bids : firm.asks;
        if (newOrder.price !== undefined) {
            let list = bookSide.get(newOrder.price);
            if (!list) {
                list = [];
                bookSide.set(newOrder.price, list);
            }
            if (!list.some((entry) => entry.id === newOrder.id)) {
                list.push(newOrder);
            }
        }
        order = newOrder;
    }

    if (order.userId !== req.id) {
        return res.status(403).json({ message: "Not your order" });
    }

    if (order.status === "CANCELLED" || order.status === "FILLED") {
        return res.status(400).json({ message: "Order cannot be cancelled" });
    }

    if (order.type !== "LIMIT" || order.price == null) {
        return res.status(400).json({ message: "Only open limit orders can be cancelled" });
    }

    const firm = ORDERBOOK[order.symbol];
    if (firm) {
        const bookSide = order.side === "BUY" ? firm.bids : firm.asks;
        const ordersAtPrice = bookSide.get(order.price);

        if (ordersAtPrice) {
            const index = ordersAtPrice.findIndex(entry => entry.id === orderId);

            if (index !== -1) {
                ordersAtPrice.splice(index, 1);
                if (ordersAtPrice.length === 0) {
                    bookSide.delete(order.price);
                }
            }
        }
    }

    order.status = "CANCELLED";

    let stockId = STOCK_BY_SYMBOL[order.symbol]?.id;
    if (!stockId) {
        const dbStock = await prisma.stock.findUnique({ where: { symbol: order.symbol } });
        if (dbStock) {
            stockId = dbStock.id;
            STOCK_BY_SYMBOL[order.symbol] = { id: stockId };
        }
    }
    if (stockId) {
        queueOrderUpsert(order, stockId);
    }

    const quantity = order.quantity - order.filledQuantity;

    if (quantity > 0n) {
        if (order.side === "BUY") {
            const inrBalance = await assureBalance(order.userId, "INR");
            const refundAmount = order.lockedQuoteAmount ?? calculateQuote(quantity, order.price!, order.symbol, "up");

            inrBalance.available += refundAmount;
            inrBalance.locked -= refundAmount;

            order.lockedQuoteAmount = undefined;

            queueBalanceUpdate(inrBalance.balanceId, inrBalance.available, inrBalance.locked, "INR");

        } else {
            const stockBalance = await assureBalance(order.userId, order.symbol);

            stockBalance.available += quantity;
            stockBalance.locked -= quantity;

            queueBalanceUpdate(stockBalance.balanceId, stockBalance.available, stockBalance.locked, order.symbol);
        }
    }

    publishOrderbook(order.symbol);
    publishBalance(order.userId);

    await flushDbBuffer();

    return res.status(200).json({ message: "Order cancelled" });
});

app.get("/orders", authMiddleware, async (req: CustomRequest, res: Response) => {

    await flushDbBuffer();

    const status = req.query.status ? String(req.query.status).toUpperCase() as OrderStatus : undefined;

    const orders = await prisma.order.findMany({
        where: {
            userId: req.id,
            status
        },
        orderBy: {
            createdAt: "desc"
        }
    });

    return res.status(200).json({ orders });
});

app.get("/orderbook/:symbol", authMiddleware, async (req: CustomRequest, res: Response) => {

    const symbol = req.params.symbol as string;
    const firm = ORDERBOOK[symbol];

    if (!firm) {
        return res.status(404).json({ message: "Symbol not found" });
    }

    const bids: Record<string, number> = {};
    for (const [price, orders] of firm.bids.entriesReversed()) {
        let total = 0n;
        for (const order of orders) {
            total += order.quantity - order.filledQuantity;
        }
        bids[formatPrice(price).toString()] = formatQuantity(total, symbol);
    }

    const asks: Record<string, number> = {};
    for (const [price, orders] of firm.asks.entries()) {
        let total = 0n;
        for (const order of orders) {
            total += order.quantity - order.filledQuantity;
        }
        asks[formatPrice(price).toString()] = formatQuantity(total, symbol);
    }

    return res.status(200).json({ bids, asks });
});

app.get("/balance", authMiddleware, async (req: CustomRequest, res: Response) => {

    const userId = req.id!;

    if (!BALANCES[userId]) {
        await assureBalance(userId, "INR");
        const balances = await prisma.balance.findMany({
            where: { userId },
            include: { stock: true }
        });
        if (!BALANCES[userId]) BALANCES[userId] = {};
        for (const bal of balances) {
            const sym = bal.assetType === "INR" ? "INR" : bal.stock!.symbol;
            const scale = getAssetScale(sym);
            if (!BALANCES[userId]![sym]) {
                BALANCES[userId]![sym] = {
                    available: parseUnits(bal.available.toString(), scale.decimals),
                    locked: parseUnits(bal.locked.toString(), scale.decimals),
                    balanceId: bal.id,
                };
            }
        }
    }

    const formatted = formatBalancesForPublish(userId);
    return res.json({ balances: formatted?.balances ?? {} });
});

app.get("/trades/personal", authMiddleware, async (req: CustomRequest, res: Response) => {
    try {
        await flushDbBuffer();

        const userId = req.id!;
        const fills = await prisma.fill.findMany({
            where: {
                OR: [
                    { buyOrder: { userId } },
                    { sellOrder: { userId } }
                ]
            },
            include: {
                stock: true,
                buyOrder: true,
                sellOrder: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        const mappedFills = fills.map(fill => {
            const side = fill.buyOrder.userId === userId ? "BUY" : "SELL";
            return {
                id: fill.id,
                stockId: fill.stockId,
                buyOrderId: fill.buyOrderId,
                sellOrderId: fill.sellOrderId,
                price: fill.price,
                quantity: fill.quantity,
                createdAt: fill.createdAt,
                side,
                symbol: fill.stock.symbol,
                buyOrder: fill.buyOrder,
                sellOrder: fill.sellOrder,
            };
        });

        return res.json({ fills: mappedFills });
    } catch (err) {
        console.error("Failed to fetch personal trades:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/trades/:symbol", authMiddleware, async (req: CustomRequest, res: Response) => {
    await flushDbBuffer();
    const fills = await prisma.fill.findMany({
        where: { stock: { symbol: req.params.symbol as string } },
        orderBy: { createdAt: "desc" },
        take: 50
    });
    return res.json({ fills });
});

app.get("/ticker/:symbol", authMiddleware, async (req: CustomRequest, res: Response) => {
    const stats = await getTickerStats(req.params.symbol as string);
    return res.json(stats);
});

app.get("/fills/:symbol", authMiddleware, async (req: CustomRequest, res: Response) => {

    const fills = await prisma.fill.findMany({
        where: {
            stock: { symbol: req.params.symbol as string }
        }
    });

    return res.status(200).json({ fills });
});

app.get("/stocks", authMiddleware, async (req: CustomRequest, res: Response) => {

    const stocks = await prisma.stock.findMany();

    return res.status(200).json({ stocks });
});

app.get("/candles/:symbol/:interval", authMiddleware, async (req: CustomRequest, res: Response) => {

    const symbol = req.params.symbol as string;
    const interval = req.params.interval as string;

    const valid = ["1m", "15m", "1h", "4h", "1d"] as const;
    type ValidInterval = typeof valid[number];
    if (!valid.includes(interval as ValidInterval)) {
        return res.status(400).json({ message: "Invalid interval" });
    }
    const snapshot = await getCandleSnapshot(symbol, interval as ValidInterval);

    return res.json(snapshot);
});

async function bootstrap() {
    const stocks = await prisma.stock.findMany();
    for (const stock of stocks) {
        STOCK_BY_SYMBOL[stock.symbol] = { id: stock.id };
        if (!ORDERBOOK[stock.symbol]) {
            ORDERBOOK[stock.symbol] = {
                bids: new BTree(undefined, (a, b) => (a < b ? -1 : a > b ? 1 : 0)),
                asks: new BTree(undefined, (a, b) => (a < b ? -1 : a > b ? 1 : 0)),
            };
        }
    }

    const balances = await prisma.balance.findMany({ include: { stock: true } });
    for (const balance of balances) {
        const symbol = balance.assetType === "INR" ? "INR" : balance.stock!.symbol;
        const scale = getAssetScale(symbol);
        if (!BALANCES[balance.userId]) BALANCES[balance.userId] = {};
        BALANCES[balance.userId]![symbol] = {
            available: parseUnits(balance.available.toString(), scale.decimals),
            locked: parseUnits(balance.locked.toString(), scale.decimals),
            balanceId: balance.id,
        };
    }

    await restoreOpenOrders();
    initWS(WS_PORT);
    runWorker().catch(err => console.error("Worker crashed:", err));

    setInterval(() => {
        advanceCandlesIfNeeded().catch(err => console.error("Candle advance error:", err));
    }, 5_000);

    app.listen(PORT, HOST, () => console.log(`CEX HTTP running on http://${HOST}:${PORT}, WS on :${WS_PORT}`));
}

bootstrap();