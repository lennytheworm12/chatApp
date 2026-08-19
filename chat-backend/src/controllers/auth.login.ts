//controller for logging in
import type { Request, Response } from 'express';
import type { LoginData } from '../types/auth.types.js';
import { UserModel } from "../models/user.model.js";
import bcrypt from 'bcryptjs';
import { generateTokenAndSetCookie } from "../utils/auth.utils.js";
import { isValidEmail, normalizeEmail } from "../utils/validation.js";
import { sanitizeUser } from "../utils/user.utils.js";

//add user to database and create a signed token inside a cookie for future requests
export const loginUser = async (req: Request<{}, {}, LoginData>, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!isValidEmail(email) || typeof password !== 'string' || password.length === 0) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    try {
        const user = await UserModel.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        generateTokenAndSetCookie(user._id.toString(), res);
        return res.status(200).json({ user: sanitizeUser(user) });
    } catch (error) {
        return res.status(500).json({ message: 'Login failed' });
    }
};
