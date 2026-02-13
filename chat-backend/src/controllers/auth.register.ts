//logic to register a user
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import type { RegisterData } from "../types/auth.types.js";
import { UserModel } from "../models/user.model.js";
import { generateTokenAndSetCookie } from "../utils/auth.utils.js";

//add user to database and create a signed token inside a cookie for future requests
export const registerUser = async (req: Request<{}, {}, RegisterData>, res: Response) => {

    //logic for registering a user
    //create a new user model and then populate with req.body
    //check if email is already in use return out immediately
    const existingUser = await UserModel.findOne({ email: req.body.email });
    if (existingUser) {
        return res.status(409).json({ message: "email already in use" });
    }

    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const newUser = new UserModel({
            //mongoose auto 
            email: req.body.email,
            password: hashedPassword,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            image: req.body.image,
            color: req.body.color,
        })


        await newUser.save();
        //create the token and set res cookie 
        generateTokenAndSetCookie(newUser._id.toString(), res);


        return res.status(201).json({ user: newUser });
    } catch (error) {
        console.error("something went wrong during registeration:", error);
        return res.status(500).json({ message: "server error during registration " });

    }



}
