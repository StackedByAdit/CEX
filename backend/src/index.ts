import type { Request, Response } from "express";
import bcrypt from "bcrypt"
import { prisma } from "./prisma";
import { AssetType } from "../generated/prisma/client";
import type { OrderStatus } from "../generated/prisma/client";
const express = require("express");
const app = express();
app.use(express.json());
import { initWS } from "./ws";


import jwt from "jsonwebtoken";

import { loginSchema, orderSchema, signupSchema } from "./schemas/zodSchema";
import type { MemoryOrder } from "./types/order";
import { authMiddleware, type CustomRequest } from "./middleware/authMiddleware";
import { assureBalance } from "./utils/assureBalance";
import { ORDERS, ORDERBOOK, BALANCES, CANDLES, STOCK_BY_SYMBOL } from "./state";
import { advanceCandlesIfNeeded, getCandleSnapshot } from "./utils/candle";
import { estimateMarketBuy, estimateMarketSell, roundInr, roundQty } from "./utils/marketOrder";
import { restoreOpenOrders } from "./utils/orderSync";
import { publishBalance, publishOrderbook } from "./utils/publish";
import { getTickerStats } from "./utils/ticker";
import { executeOrder, runWorker } from "./worker";
const PORT = 3000;

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
                        available: 100000000,
                        locked: 0
                    }
                });
                if (!BALANCES[newUser.id]) BALANCES[newUser.id] = {};

                BALANCES[newUser.id]![stock.symbol] = {
                    available: 1000000000,
                    locked: 0,
                    balanceId: balance.id
                };
            })
        );

        const inrBalance = await prisma.balance.create({
            data: {
                userId: newUser.id,
                assetType: AssetType.INR,
                available: 100000000000,
                locked: 0
            }
        });

        BALANCES[newUser.id]!["INR"] = {
            available: 100000000000,
            locked: 0,
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

        return res.status(200).json({
            message: "Login successful",
            token
        });

    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/order", authMiddleware, async (req: CustomRequest, res: Response) => {

    const order = orderSchema.safeParse(req.body);

    if (!order.success) {
        return res.status(400).json({ message: order.error.issues[0]?.message ?? "invalid order" });
    }

    const { side, type, symbol, price, quantity } = order.data;
    const orderQuantity = roundQty(quantity);

    const userId = req.id!;

    const stock = STOCK_BY_SYMBOL[symbol]
        ? { id: STOCK_BY_SYMBOL[symbol]!.id, symbol }
        : await prisma.stock.findUnique({ where: { symbol } });

    if (!stock) {
        return res.status(404).json({ message: "Stock not found" });
    }

    if (!ORDERBOOK[symbol]) {
        ORDERBOOK[symbol] = { bids: {}, asks: {} };
    }

    const stockId = stock.id;

    if (!BALANCES[userId]?.INR || !BALANCES[userId]?.[symbol]) {
        await Promise.all([
            assureBalance(userId, "INR"),
            assureBalance(userId, symbol),
        ]);
    }

    const inrBalance = BALANCES[userId]!.INR!;
    const stockBalance = BALANCES[userId]![symbol]!;

    let lockedQuoteAmount: number | undefined;

    if (side == "BUY") {

        if (type == "LIMIT") {

            const amount = roundInr(price! * orderQuantity);

            if (inrBalance.available < amount) {
                return res.status(400).json({ message: "INSUFFICIENT INR" });
            }

            inrBalance.available -= amount;
            inrBalance.locked += amount;

            prisma.balance.update({
                where: { id: inrBalance.balanceId },
                data: {
                    available: { decrement: amount },
                    locked: { increment: amount }
                }
            }).catch(err => console.error("DB sync error (buy lock):", err));
        }

        if (type === "MARKET") {
            const estimate = estimateMarketBuy(symbol, orderQuantity);

            if (estimate.fillableQuantity <= 0) {
                return res.status(400).json({ message: "INSUFFICIENT LIQUIDITY" });
            }

            lockedQuoteAmount = estimate.estimatedQuote;

            if (inrBalance.available < lockedQuoteAmount) {
                return res.status(400).json({ message: "INSUFFICIENT INR" });
            }

            inrBalance.available -= lockedQuoteAmount;
            inrBalance.locked += lockedQuoteAmount;

            prisma.balance.update({
                where: { id: inrBalance.balanceId },
                data: {
                    available: { decrement: lockedQuoteAmount },
                    locked: { increment: lockedQuoteAmount }
                }
            }).catch(err => console.error("DB sync error (market buy lock):", err));
        }

    } else {

        if (stockBalance.available < orderQuantity) {
            return res.status(400).json({ message: `INSUFFICIENT ${symbol}` });
        }

        if (type === "MARKET") {
            const estimate = estimateMarketSell(symbol, orderQuantity);
            if (estimate.fillableQuantity <= 0) {
                return res.status(400).json({ message: "INSUFFICIENT LIQUIDITY" });
            }
        }

        stockBalance.available -= orderQuantity;
        stockBalance.locked += orderQuantity;

        prisma.balance.update({
            where: { id: stockBalance.balanceId },
            data: {
                available: { decrement: orderQuantity },
                locked: { increment: orderQuantity }
            }
        }).catch(err => console.error("DB sync error (sell lock):", err));
    }

    const orderId = crypto.randomUUID();

    const currOrder: MemoryOrder = {
        id: orderId,
        userId,
        side,
        symbol,
        type,
        status: "PENDING",
        price: type === "LIMIT" ? price : undefined,
        quantity: orderQuantity,
        filledQuantity: 0,
        lockedQuoteAmount,
    };

    const result = executeOrder(currOrder, stockId);

    return res.status(200).json({
        orderId,
        status: result.status,
        filledQuantity: result.filledQuantity,
        remainingQuantity: roundQty(orderQuantity - result.filledQuantity),
        fills: result.fills,
        actualQuote: result.actualQuote,
        refundQuote: result.refundQuote,
        estimatedQuote: lockedQuoteAmount ?? (type === "LIMIT" && side === "BUY" ? roundInr(price! * orderQuantity) : undefined),
    });
});

app.delete("/order/:orderId", authMiddleware, async (req: CustomRequest, res: Response) => {

    const orderId = req.params.orderId as string;

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

        order = {
            id: dbOrder.id,
            userId: dbOrder.userId,
            side: dbOrder.side,
            type: dbOrder.type,
            symbol: dbOrder.stock.symbol,
            price: dbOrder.price.toNumber(),
            quantity: dbOrder.quantity.toNumber(),
            filledQuantity: dbOrder.filledQuantity.toNumber(),
            status: dbOrder.status,
        };

        ORDERS.push(order);

        const firm = ORDERBOOK[order.symbol] ?? { bids: {}, asks: {} };
        ORDERBOOK[order.symbol] = firm;
        const bookSide = order.side === "BUY" ? firm.bids : firm.asks;
        if (!bookSide[order.price]) bookSide[order.price] = [];
        if (!bookSide[order.price]!.some((entry) => entry.id === order.id)) {
            bookSide[order.price]!.push(order);
        }
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
    if (!firm) {
        return res.status(404).json({ message: "Symbol not found" });
    }

    const bookSide = order.side === "BUY" ? firm.bids : firm.asks;
    const ordersAtPrice = bookSide[order.price];

    if (!ordersAtPrice) {
        return res.status(404).json({ message: "Order not found in orderbook" });
    }

    const index = ordersAtPrice.findIndex(entry => entry.id === orderId);

    if (index === -1) {
        return res.status(404).json({ message: "Order not found in orderbook" });
    }

    ordersAtPrice.splice(index, 1);
    if (ordersAtPrice.length === 0) {
        delete bookSide[order.price];
    }

    order.status = "CANCELLED";

    try {
        await prisma.order.update({
            where: { id: orderId },
            data: { status: "CANCELLED" },
        });
    } catch (err) {
        console.error("DB sync error (cancel order):", err);
        return res.status(500).json({ message: "Failed to cancel order" });
    }

    const price = order.price;
    const quantity = roundQty(order.quantity - order.filledQuantity);

    if (order.side === "BUY") {
        const inrBalance = await assureBalance(order.userId, "INR");

        inrBalance.available += price * quantity;
        inrBalance.locked -= price * quantity;

        prisma.balance.update({
            where: { id: inrBalance.balanceId },
            data: {
                available: { increment: price * quantity },
                locked: { decrement: price * quantity }
            }
        }).catch(err => console.error("DB sync error (cancel buy refund):", err));

    } else {
        const stockBalance = await assureBalance(order.userId, order.symbol);

        stockBalance.available += quantity;
        stockBalance.locked -= quantity;

        prisma.balance.update({
            where: { id: stockBalance.balanceId },
            data: {
                available: { increment: quantity },
                locked: { decrement: quantity }
            }
        }).catch(err => console.error("DB sync error (cancel sell refund):", err));
    }

    publishOrderbook(order.symbol);
    publishBalance(order.userId);

    return res.status(200).json({ message: "Order cancelled" });
});

app.get("/orders", authMiddleware, async (req: CustomRequest, res: Response) => {

    const status = req.query.status ? String(req.query.status).toUpperCase() as OrderStatus : undefined;

    const orders = await prisma.order.findMany({
        where: {
            userId: req.id,
            status
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
    for (const [price, orders] of Object.entries(firm.bids)) {
        let total = 0;
        for (const order of orders) {
            total += order.quantity - order.filledQuantity;
        }
        bids[price] = total;
    }

    const asks: Record<string, number> = {};
    for (const [price, orders] of Object.entries(firm.asks)) {
        let total = 0;
        for (const order of orders) {
            total += order.quantity - order.filledQuantity;
        }
        asks[price] = total;
    }

    return res.status(200).json({ bids, asks });
});

app.get("/balance", authMiddleware, async (req: CustomRequest, res: Response) => {

    const userId = req.id!;

    if (BALANCES[userId]) {
        return res.json({ balances: BALANCES[userId] });
    }

    const balances = await prisma.balance.findMany({
        where: { userId },
        include: { stock: true }
    });

    return res.json({ balances });
});

app.get("/trades/:symbol", authMiddleware, async (req: CustomRequest, res: Response) => {
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

    const snapshot = await getCandleSnapshot(symbol, interval as import("./utils/candle").Interval);

    return res.json(snapshot);
});

async function bootstrap() {
    const stocks = await prisma.stock.findMany();
    for (const stock of stocks) {
        STOCK_BY_SYMBOL[stock.symbol] = { id: stock.id };
    }

    const balances = await prisma.balance.findMany({ include: { stock: true } });
    for (const balance of balances) {
        const symbol = balance.assetType === "INR" ? "INR" : balance.stock!.symbol;
        if (!BALANCES[balance.userId]) BALANCES[balance.userId] = {};
        BALANCES[balance.userId]![symbol] = {
            available: balance.available.toNumber(),
            locked: balance.locked.toNumber(),
            balanceId: balance.id
        };
    }

    await restoreOpenOrders();
    initWS(8080);
    runWorker().catch(err => console.error("Worker crashed:", err));

    setInterval(() => {
        advanceCandlesIfNeeded().catch(err => console.error("Candle advance error:", err));
    }, 5_000);

    app.listen(PORT, () => console.log("CEX running on :3000"));
}

bootstrap();