//search for all users except one

import type { Request, Response } from 'express';
import { UserModel } from "../models/user.model.js";

export const searchForAllUsers = async (req: Request, res: Response) => {

    //
    //search for users using the req.searchTerm

    try {
        const users = await UserModel.find({
            _id: { $ne: req.userId },//exclude the user id
        });

        const contacts = users.map(user => ({
            label: `${user.firstName} ${user.lastName}`,
            value: user._id.toString()
        }));
        return res.status(200).json({ contacts});
    }
    //filtered all the users lettign the db do the sorting (more optimized)
    catch (error) {
        return res.status(500).json({ message: "data base retrevial error" });
    }


}

