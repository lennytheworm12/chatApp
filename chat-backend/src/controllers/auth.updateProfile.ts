//method to update a users profile
import type { Request, Response } from 'express';
import type { UpdateProfileData } from '../types/auth.types.js';
import { UserModel } from "../models/user.model.js";
import { sanitizeUser } from "../utils/user.utils.js";

const MAX_COLOR_LENGTH = 100;
const MAX_NAME_LENGTH = 50;

function isNonEmptyTrimmedString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

//given a request from the client with new user info update
export const updateProfile = async (req: Request<{}, {}, UpdateProfileData>, res: Response) => {
    const { firstName, lastName, color } = req.body;

    if (
        !isNonEmptyTrimmedString(firstName) ||
        !isNonEmptyTrimmedString(lastName) ||
        firstName.trim().length > MAX_NAME_LENGTH ||
        lastName.trim().length > MAX_NAME_LENGTH
    ) {
        return res.status(400).json({ message: 'Invalid or missing required fields' });
    }

    if (color !== undefined && (!isNonEmptyTrimmedString(color) || color.trim().length > MAX_COLOR_LENGTH)) {
        return res.status(400).json({ message: 'Invalid or missing required fields' });
    }

    try {
        const user = await UserModel.findByIdAndUpdate(req.userId,
            {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                ...(color !== undefined ? { color: color.trim() } : {}),
                profileSetup: true,
            },
            { returnDocument: 'after' }
        );

        if (!user) return res.status(404).json({ message: "unable to find user" });
        return res.status(200).json({ user: sanitizeUser(user) });
    } catch (error) {
        return res.status(500).json({ message: "failed to update the profile" });
    }
};
