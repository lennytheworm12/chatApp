//search for users filtering by name or email
//takes search term in request body

import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import type { SearchContactsData } from '../types/auth.types.js';
import { UserModel } from "../models/user.model.js";
import { escapeRegex, isValidObjectId } from "../utils/validation.js";
import { sanitizeUser } from "../utils/user.utils.js";

const MAX_SEARCH_TERM_LENGTH = 100;

export const searchForUsers = async (req: Request<{}, {}, SearchContactsData>, res: Response) => {
    if (!req.userId || !isValidObjectId(req.userId)) {
        return res.status(401).json({ message: "Not authenticated" });
    }

    const searchTerm = typeof req.body?.searchTerm === 'string' ? req.body.searchTerm.trim() : '';
    if (!searchTerm) {
        return res.status(400).json({ message: "search term is required" });
    }
    if (searchTerm.length > MAX_SEARCH_TERM_LENGTH) {
        return res.status(400).json({ message: "search term is too long" });
    }

    try {
        //escape regex metacharacters so user input is matched literally
        const pattern = escapeRegex(searchTerm);
        const users = await UserModel.find({
            _id: { $ne: new Types.ObjectId(req.userId) },
            $or: [
                { firstName: { $regex: pattern, $options: 'i' } },
                { lastName: { $regex: pattern, $options: 'i' } },
                { email: { $regex: pattern, $options: 'i' } }
            ]
        });
        return res.status(200).json({ contacts: users.map(sanitizeUser) });
    } catch (error) {
        return res.status(500).json({ message: "data base retrevial error" });
    }
};
