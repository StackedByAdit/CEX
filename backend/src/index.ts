import express from "express";
import type { Request, Response } from "express";
import { AssetType, PrismaClient } from "../generated/prisma/client";
import bcrypt from "bcrypt";
import { prisma } from "./prisma";
import { loginSchema, orderSchema, signupSchema } from "./schemas/zodSchema";
import jwt from "jsonwebtoken";
import { assureBalance } from "./utils/assureBalance";
import { matchOrder } from "./utils/matchOrder";
import type { MemoryOrder } from "./types/order";
import { ORDERBOOK } from "./state";
import { authMiddleware, JWT_SECRET, type customRequest } from "./middleware/authMiddleware";

const PORT = 3000;

const app = express();
app.use(express.json());

const STOCKS = [
    { id: 1, title: "AXIS BANK", symbol: "AXIS" },
    { id: 2, title: "HDFC BANK", symbol: "HDFC" },
    { id: 3, title: "TATA Steel", symbol: "TATA" },
];

const ORDERS: MemoryOrder[] = [];

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
            where: {
                username
            }
        });

        if (existingUser) {
            return res.status(400).json({
                message: "User already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                username,
                password: hashedPassword
            }
        });

        await prisma.balance.create({
            data: {
                userId: newUser.id,
                assetType: AssetType.INR,
                available: 100000,
                locked: 0
            }
        });

        return res.json({
            message: "User created",
            userId: newUser.id
        });

    } catch (err) {

        console.log(err);

        return res.status(500).json({
            message: "Internal server error"
        });
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

        const user = await prisma.user.findUnique({
            where: {
                username
            }
        });

        if (!user) {
            return res.status(401).json({
                message: "Invalid credentials"
            });
        }

        const isCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!isCorrect) {
            return res.status(401).json({
                message: "Invalid credentials"
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                username: user.username
            },
            JWT_SECRET,
            {
                expiresIn: "1h"
            }
        );

        return res.status(200).json({
            message: "Login successful",
            token
        });

    } catch (err) {

        console.log(err);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
});

app.post("/order", authMiddleware, async (req: customRequest, res: Response) => {

    const result = orderSchema.safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({
            message: "Invalid input",
            error: result.error.issues
        });
    }

    const userId = req.userId!;

    const {
        side,
        type,
        symbol,
        price,
        quantity
    } = result.data;

    try {

        const stock = await prisma.stock.findUnique({
            where: {
                symbol
            }
        });

        if (!stock) {
            return res.status(404).json({
                message: "Stock not found"
            });
        }

        const inrBalance = await assureBalance(userId, "INR");

        const stockBalance = await assureBalance(
            userId,
            symbol
        );

        let estimatedCost = 0;

        if (side === "BUY") {

            if (type === "LIMIT") {

                if (price === undefined) {
                    return res.status(400).json({
                        message: "Price required for LIMIT order"
                    });
                }

                const amount = price * quantity;

                if (inrBalance.available.toNumber() < amount) {
                    return res.status(400).json({
                        message: "INSUFFICIENT INR"
                    });
                }

                await prisma.balance.update({
                    where: {
                        id: inrBalance.id
                    },
                    data: {
                        available: {
                            decrement: amount
                        },
                        locked: {
                            increment: amount
                        }
                    }
                });
            }

            if (type === "MARKET") {
                const book = ORDERBOOK[symbol];

                if (!book) {
                    return res.status(400).json({
                        message: "Invalid symbol"
                    });
                }

                const askPrices = Object.keys(book.asks)
                    .map(Number)
                    .sort((a, b) => a - b);

                let remainingQty = quantity;

                for (const askPrice of askPrices) {

                    const orders = book.asks[askPrice];

                    if (!orders) continue;

                    for (const ask of orders) {

                        const fillable = Math.min(
                            remainingQty,
                            ask.quantity - ask.filledQuantity
                        );

                        estimatedCost += fillable * askPrice;
                        remainingQty -= fillable;

                        if (remainingQty <= 0) break;
                    }

                    if (remainingQty <= 0) break;
                }

                if (remainingQty > 0) {
                    return res.status(400).json({
                        message: "Insufficient liquidity to fill MARKET BUY order"
                    });
                }

                if (inrBalance.available.toNumber() < estimatedCost) {
                    return res.status(400).json({
                        message: "INSUFFICIENT INR"
                    });
                }

                await prisma.balance.update({
                    where: {
                        id: inrBalance.id
                    },
                    data: {
                        available: {
                            decrement: estimatedCost
                        },
                        locked: {
                            increment: estimatedCost
                        }
                    }
                });
            }

        } else {

            if (stockBalance.available.toNumber() < quantity) {
                return res.status(400).json({
                    message: `INSUFFICIENT ${symbol}`
                });
            }

            await prisma.balance.update({
                where: {
                    id: stockBalance.id
                },
                data: {
                    available: {
                        decrement: quantity
                    },
                    locked: {
                        increment: quantity
                    }
                }
            });
        }


        const dbOrder = await prisma.order.create({
            data: {
                userId,
                stockId: stock.id,
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
            symbol,
            side,
            type,
            price,
            quantity,
            filledQuantity: 0,
            status: "PENDING"
        };

        matchOrder(currOrder);

        if (currOrder.side === "BUY" && currOrder.type === "MARKET") {

            const actualCost = 
                currOrder.filledQuantity * (currOrder.price ?? 0);

            const refund = estimatedCost - actualCost;
            if (refund > 0) {
                await prisma.balance.update({
                    where: { id: inrBalance.id },
                    data: {
                        available: { increment: refund },
                        locked: { decrement: refund }
                    }
                });
            }
        }

        await prisma.order.update({
            where: {
                id: dbOrder.id
            },
            data: {
                filledQuantity: currOrder.filledQuantity,
                status: currOrder.status
            }
        });

        if (currOrder.filledQuantity < currOrder.quantity) {

            if (currOrder.type === "LIMIT") {

                const book = ORDERBOOK[symbol];

                if (!book) {
                    return res.status(400).json({
                        message: "Invalid symbol"
                    });
                }

                const sideBook =
                    side === "BUY"
                        ? book.bids
                        : book.asks;

                const orderPrice = currOrder.price;

                if (orderPrice === undefined) {
                    return res.status(400).json({
                        message: "LIMIT order price missing"
                    });
                }

                if (!sideBook[orderPrice]) {
                    sideBook[orderPrice] = [];
                }

                sideBook[orderPrice].push(currOrder);

                ORDERS.push(currOrder);

            } else {

                currOrder.status = "CANCELLED";

                await prisma.order.update({
                    where: {
                        id: dbOrder.id
                    },
                    data: {
                        status: "CANCELLED"
                    }
                });
            }
        }

        return res.status(200).json({
            message: "Order placed",
            order: currOrder
        });

    } catch (e) {

        console.log(e);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
});

app.listen((PORT), () => {
    console.log(`Running on port ${PORT}`)
})

