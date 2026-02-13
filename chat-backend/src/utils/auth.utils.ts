//utilities for auth 
//will create the jwt token after a user signs up and logs in 
//
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();
const jwtKey = process.env.JWT_SECRET;
const nodeEnv = process.env.NODE_ENV;

//create a token with our jwt and wrap inside a cookie 
//user id being our db id and we fill response with it 
//
export const generateTokenAndSetCookie = (userId: string, res: Response) => {
    //create our signed token
    const token = jwt.sign(
        { userId },
        jwtKey!,
        { expiresIn: '7d' }
    );

    //create the cookie to store the token
    res.cookie('jwt', token, {
        httpOnly: true,
        secure: nodeEnv == 'production',
        maxAge: 7 * 24 * 60 * 1000,

    });

};

