//controller for logging in 

import type { Request, Response } from 'express';
import type { LoginData } from '../types/auth.types.js';
import { UserModel } from "../models/user.model.js";
import bcrypt from 'bcryptjs';
import { generateTokenAndSetCookie } from "../utils/auth.utils.js";


//add user to database and create a signed token inside a cookie for future requests
export const loginUser = async (req: Request<{}, {}, LoginData>, res: Response) => {

    //logic for logging a user in
    try {
        //take a users email and query the db to see if email exists
        //and check if passwords match
        const user = await UserModel.findOne({ email: req.body.email }).select('+password');
        if (!user) {
            return res.status(404).json({ message: "user not found" });
        }


        const isMatch = await bcrypt.compare(req.body.password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "invalid password" });
        }

        //if password matches create the token
        generateTokenAndSetCookie(user._id.toString(), res);
        //returns the stripped user
        return res.status(200).json({ user });
        //returns the stripped user

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Login failed' });
    }
};
