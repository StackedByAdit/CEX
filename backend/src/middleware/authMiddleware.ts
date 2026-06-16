import type { Request, Response, NextFunction } from "express";
import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import { getSessionTokenFromRequest } from "../utils/sessionCookie";

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
        const token = getSessionTokenFromRequest(req);

        if (!token) {
            return res.status(401).json({
                message: "token missing"
            });
        }

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