//logic to register a user
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import type { RegisterData } from "../types/auth.types.js";
import { UserModel } from "../models/user.model.js";
import { generateTokenAndSetCookie } from "../utils/auth.utils.js";
import { isValidEmail, normalizeEmail } from "../utils/validation.js";
import { sanitizeUser } from "../utils/user.utils.js";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

//add user to database and create a signed token inside a cookie for future requests
export const registerUser = async (req: Request<{}, {}, RegisterData>, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!isValidEmail(email) || typeof password !== 'string' || password.length === 0) {
        return res.status(400).json({ message: "Email and password are required" });
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ message: "Password must be between 8 and 72 characters" });
    }

    try {
        const existingUser = await UserModel.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: "email already in use" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new UserModel({
            email,
            password: hashedPassword,
        });

        await newUser.save();
        generateTokenAndSetCookie(newUser._id.toString(), res);

        return res.status(201).json({ user: sanitizeUser(newUser) });
    } catch (error) {
        return res.status(500).json({ message: "server error during registration " });
    }
};
