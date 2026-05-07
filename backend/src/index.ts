import express from "express";
import type { Request, Response } from "express";
import { AssetType, PrismaClient } from "../generated/prisma/client";
import bcrypt from "bcrypt";
import { prisma } from "./prisma";
import { loginSchema, signupSchema } from "./schemas/zodSchema";
import jwt from "jsonwebtoken";

const PORT = 3000;

const JWT_SECRET = "secretkey123";

const app = express();
app.use(express.json());

const STOCKS = [
    { id: 1, title: "AXIS BANK", symbol: "AXIS" },
    { id: 2, title: "HDFC BANK", symbol: "HDFC" },
    { id: 3, title: "TATA Steel", symbol: "TATA" },
];

const ORDERS = [];
const ORDERBOOK = {
    AXIS: { bids: {}, asks: {} },
    HDFC: { bids: {}, asks: {} },
    TATA: { bids: {}, asks: {} },
};

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

app.listen((PORT), () => {
    console.log(`Running on port ${PORT}`)
})