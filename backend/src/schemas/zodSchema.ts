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
    price : z.union([z.number().positive(), z.string()]).optional(),
    quantity : z.union([z.number().positive(), z.string()]),
}).superRefine((data, ctx) => {
    if (data.type === "LIMIT" && data.price === undefined) {
        ctx.addIssue({ code: "custom", message: "Price required for LIMIT order" });
    }
    if (data.type === "MARKET" && data.price !== undefined) {
        ctx.addIssue({ code: "custom", message: "Price not allowed for MARKET order" });
    }
    if (typeof data.quantity === "string") {
        const qNum = Number(data.quantity);
        if (!Number.isFinite(qNum) || qNum <= 0) {
            ctx.addIssue({ code: "custom", message: "Quantity must be positive" });
        }
    }
    if (typeof data.price === "string") {
        const pNum = Number(data.price);
        if (!Number.isFinite(pNum) || pNum <= 0) {
            ctx.addIssue({ code: "custom", message: "Price must be positive" });
        }
    }
});