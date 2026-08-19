//utilities for auth
//will create the jwt token after a user signs up and logs in
//
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import type { CookieOptions, Response } from 'express';

dotenv.config();

const jwtKey = process.env.JWT_SECRET;
const nodeEnv = process.env.NODE_ENV;

export const jwtCookieName = 'jwt';

export const jwtCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: nodeEnv === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

//create a token with our jwt and wrap inside a cookie
//user id being our db id and we fill response with it
//
export const generateTokenAndSetCookie = (userId: string, res: Response) => {
    const token = jwt.sign(
        { userId },
        jwtKey!,
        { expiresIn: '7d' }
    );
    res.cookie(jwtCookieName, token, jwtCookieOptions);
};
