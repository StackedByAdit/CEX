import type { Request, Response } from "express";
import bcrypt from "bcrypt"
import { prisma } from "./prisma";
import { AssetType } from "../generated/prisma/client";
import type { OrderStatus } from "../generated/prisma/client";
const express = require("express");
const app = express();
app.use(express.json());
import { redisClient } from "./redis";
import { initWS } from "./ws";


import jwt from "jsonwebtoken";

import { loginSchema, orderSchema, signupSchema } from "./schemas/zodSchema";
import type { MemoryOrder } from "./types/order";
import { authMiddleware, type CustomRequest } from "./middleware/authMiddleware";
import { assureBalance } from "./utils/assureBalance";
import { ORDERS, ORDERBOOK, BALANCES } from "./state";
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
                        available: 100,
                        locked: 0
                    }
                });
                if (!BALANCES[newUser.id]) BALANCES[newUser.id] = {};
                BALANCES[newUser.id]![stock.symbol] = {
                    available: 100,
                    locked: 0,
                    balanceId: balance.id
                };
            })
        );

        const inrBalance = await prisma.balance.create({
            data: {
                userId: newUser.id,
                assetType: AssetType.INR,
                available: 100000,
                locked: 0
            }
        });

        BALANCES[newUser.id]!["INR"] = {
            available: 100000,
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
        return res.status(400).json({ message: "invalid order" });
    }

    const { side, type, symbol, price, quantity } = order.data;

    const userId = req.id!;

    const stock = await prisma.stock.findUnique({ where: { symbol } });

    if (!stock) {
        return res.status(404).json({ message: "Stock not found" });
    }

    if (!ORDERBOOK[symbol]) {
        ORDERBOOK[symbol] = { bids: {}, asks: {} };
    }

    const stockId = stock.id;

    const inrBalance = await assureBalance(userId, "INR");
    const stockBalance = await assureBalance(userId, symbol);

    if (side == "BUY") {

        if (type == "LIMIT") {

            if (price === undefined) {
                return res.status(400).json({ message: "Price required for LIMIT order" });
            }

            const amount = price * quantity;

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
            return res.status(400).json({
                message: "how we gonna implement account balance check"
            });
        }

    } else {

        if (stockBalance.available < quantity) {
            return res.status(400).json({ message: `INSUFFICIENT ${symbol}` });
        }

        stockBalance.available -= quantity;
        stockBalance.locked += quantity;

        prisma.balance.update({
            where: { id: stockBalance.balanceId },
            data: {
                available: { decrement: quantity },
                locked: { increment: quantity }
            }
        }).catch(err => console.error("DB sync error (sell lock):", err));
    }

    const dbOrder = await prisma.order.create({
        data: {
            userId,
            stockId,
            side,
            type,
            status: "PENDING",
            price,
            quantity,
            filledQuantity: 0
        }
    });

    const currOrder: MemoryOrder = {
        id: dbOrder.id,
        userId,
        side,
        symbol,
        type,
        status: "PENDING",
        price,
        quantity,
        filledQuantity: 0
    };

    await redisClient.lpush("queue:orders", JSON.stringify({ ...currOrder, stockId: stock.id }));

    const redisRes = await redisClient.blpop(`result:${dbOrder.id}`, 10);

    if (!redisRes) {
        return res.status(408).json({ message: "Order processing timed out" });
    }

    const result = JSON.parse(redisRes[1]);

    return res.status(200).json({
        orderId: dbOrder.id,
        status: result.status,
        filledQuantity: result.filledQuantity,
        remainingQuantity: quantity - result.filledQuantity,
        fills: result.fills,
    });
});

app.delete("/order/:orderId", authMiddleware, async (req: CustomRequest, res: Response) => {

    const orderId = req.params.orderId as string;

    const order = ORDERS.find(order => order.id === orderId);

    if (!order) {
        return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId !== req.id) {
        return res.status(403).json({ message: "Not your order" });
    }

    if (order.status === "CANCELLED" || order.status === "FILLED") {
        return res.status(400).json({ message: "Order cannot be cancelled" });
    }

    const aboutOrder = order.side === "BUY" ? ORDERBOOK[order.symbol]!.bids : ORDERBOOK[order.symbol]!.asks;

    const ordersAtPrice = aboutOrder[order.price!];

    if (!ordersAtPrice) {
        return res.status(404).json({ message: "Order not found in orderbook" });
    }

    const index = ordersAtPrice.findIndex(order => order.id === orderId);

    if (index === -1) {
        return res.status(404).json({ message: "Order not found in orderbook" });
    } else {
        ordersAtPrice.splice(index, 1);
        if (ordersAtPrice.length === 0) {
            delete aboutOrder[order.price!];
        }
    }

    order.status = "CANCELLED";

    prisma.order.update({
        where: { id: orderId },
        data: { status: "CANCELLED" },
    }).catch(err => console.error("DB sync error (cancel order):", err));

    const price = order.price!;
    const quantity = order.quantity - order.filledQuantity;

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

app.get("/fills/:symbol", authMiddleware, async (req: CustomRequest, res: Response) => {

    const fills = await prisma.fill.findMany({
        where: {
            stock: { symbol: req.params.symbol as string }
        }
    });

    return res.status(200).json({ fills });
});

app.get("/ticker/:symbol", authMiddleware, async (req: CustomRequest, res: Response) => {
    const lastFill = await prisma.fill.findFirst({
        where: { stock: { symbol: req.params.symbol as string } },
        orderBy: { createdAt: "desc" }
    });
    return res.json({ price: lastFill?.price ?? null });
});


app.get("/stocks", authMiddleware, async (req: CustomRequest, res: Response) => {

    const stocks = await prisma.stock.findMany();

    return res.status(200).json({ stocks });
});

async function bootstrap() {
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
    initWS(8080);
    app.listen(PORT, () => console.log("CEX running on :3000"));
}

bootstrap();