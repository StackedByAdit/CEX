import type { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;


export interface CustomRequest extends Request {
    user?: string;
    id?: string;
}

interface MyJwtPayload extends JwtPayload {
    username: string;
    id: string;
}

export async function authMiddleware(
    req: CustomRequest,
    res: Response,
    next: NextFunction
) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(400).json({
                message: "token missing"
            });
        }

        const token = authHeader.split(" ")[1]!;

        const verified = jwt.verify(token, JWT_SECRET) as JwtPayload;

        req.user = verified.username;
        req.id = verified.id;

        next();

    } catch (e) {

        console.log(e);

        return res.status(401).json({
            message: "invalid token"
        });
    }
}