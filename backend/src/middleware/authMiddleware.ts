import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

export const JWT_SECRET = "secretkey123";

interface myJwtPayload extends JwtPayload {
    id : string;
}

interface customRequest extends Request {
    userId : string;
}

export async function authMiddleware(req: customRequest, res: Response, next: NextFunction) {

    try {

        const token = req.headers.authorization;

        if (!token) {
            return res.status(400).json({
                message: "No token"
            })
        }

        const verified = jwt.verify(token, JWT_SECRET) as myJwtPayload;

        req.userId = verified.id


        next();

    } catch (e) {

        return res.status(401).json({
            message: "Invalid token"
        })
    }


}