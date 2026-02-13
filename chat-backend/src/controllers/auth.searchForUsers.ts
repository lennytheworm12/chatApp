//search for users filtering by name or email
//takes search term in in request body


import type { Request, Response } from 'express';
import type { SearchContactsData } from '../types/auth.types.js';
import { UserModel } from "../models/user.model.js";


export const searchForUsers = async (req: Request<{}, {}, SearchContactsData>, res: Response) => {
    //search for users using the req.searchTerm
    if (!req.body.searchTerm) {
        return res.status(400).json({message: "search term is required"});
    }

    try {
        const users = await UserModel.find({
            _id: { $ne: req.userId },//exclude the user id
            $or: [
                { firstName: { $regex: req.body.searchTerm, $options: 'i' } },
                { lastName: { $regex: req.body.searchTerm, $options: 'i' } },
                { email: { $regex: req.body.searchTerm, $options: 'i' } }

            ]

        });
        return res.status(200).json({contacts: users});
    }
        //filtered all the users lettign the db do the sorting (more optimized)
     catch (error) {
        return res.status(500).json({ message: "data base retrevial error" });
    }


}
