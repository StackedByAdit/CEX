import { z } from "zod";

export const signupSchema = z.object({
    username : z.string().min(3, "uesrname too short"),
    password : z.string().min(6, "password too short")
})

export const loginSchema = z.object({
    username : z.string(),
    password : z.string()
})

export const orderSchema = z.object({
    side : z.enum(["BUY", "SELL"]),
    type : z.enum(["LIMIT", "MARKET"]),
    symbol : z.string(),
    price : z.number().optional(),
    quantity : z.number()
})