//file to get user info req.userId
//
//
import type { Request, Response } from 'express';
import { UserModel } from "../models/user.model.js";

export const getUserInfo = async (req: Request, res: Response) => {
    //after verification so we should have req.userid
    try {
        const user = await UserModel.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: "user was not found" });
        }
        const { _id, ...rest } = user.toObject();
        res.status(200).json({ user: { id: user._id, ...user.toObject() } });



    } catch (error) {
        return res.status(500).json({ message: "could not retrieve user" });
    }

}
