import express from "express";
import type { Request, Response } from "express";
import { AssetType, PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";
import { signupSchema } from "./schemas/zodSchema";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

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

const prisma = new PrismaClient({adapter});

app.post("/signup", async (req: Request, res : Response) => {

    const result = signupSchema.safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({
            msg: "Invalid input",
            errors: result.error.issues,
        });
    }

    const { username, password } = result.data;

    try {

        // check existing user
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

        // hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // create user
        const newUser = await prisma.user.create({
            data: {
                username,
                password: hashedPassword
            }
        });

        // create INR balance
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