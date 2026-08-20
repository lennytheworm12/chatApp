//verify if the request has a cookie and then verify the cookie with our jwt
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { isValidObjectId } from "../utils/validation.js";

dotenv.config();

export const verifyUser = (req: Request, res: Response, next: NextFunction) => {
    //check the request for jwt
    try {
        if (!req.cookies || !req.cookies.jwt) {
            return res.status(401).json({ message: "request not authenticated" });
        }
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(401).json({ message: "could not verify user" });
        }
        const decoded = jwt.verify(req.cookies.jwt, secret) as { userId?: unknown };
        if (!isValidObjectId(decoded.userId)) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        req.userId = decoded.userId;
        //pass onto the next method now with userId inside request
        next();
    } catch (error) {
        return res.status(401).json({ message: "could not verify user" });
    }
}
