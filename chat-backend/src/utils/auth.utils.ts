//utilities for auth
//will create the jwt token after a user signs up and logs in
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import type { CookieOptions, Response } from 'express';

dotenv.config();

export const jwtCookieName = 'jwt';

// Options are computed at call time so they reflect the environment after
// dotenv has loaded (and so tests can change NODE_ENV between calls).
export const getJwtCookieOptions = (): CookieOptions => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
});

//create a token with our jwt and wrap inside a cookie
//user id being our db id and we fill response with it
export const generateTokenAndSetCookie = (userId: string, res: Response) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not configured');
    }
    const token = jwt.sign({ userId }, secret, { expiresIn: '7d' });
    res.cookie(jwtCookieName, token, getJwtCookieOptions());
};
