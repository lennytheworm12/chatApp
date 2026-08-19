//file to get user info req.userId
import type { Request, Response } from 'express';
import { UserModel } from "../models/user.model.js";
import { sanitizeUser } from "../utils/user.utils.js";

export const getUserInfo = async (req: Request, res: Response) => {
    if (!req.userId) {
        return res.status(401).json({ message: "request not authenticated" });
    }

    try {
        const user = await UserModel.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: "user was not found" });
        }
        return res.status(200).json({ user: sanitizeUser(user) });
    } catch (error) {
        return res.status(500).json({ message: "could not retrieve user" });
    }
};
