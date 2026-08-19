//this controller handles logging out the user/wiping their jwt token from cookie
import type { Request, Response } from 'express';
import { jwtCookieName, jwtCookieOptions } from '../utils/auth.utils.js';

export const logoutUser = async (_req: Request, res: Response) => {
    //clear the cookie with the same options used to set it
    res.clearCookie(jwtCookieName, jwtCookieOptions);
    return res.status(200).json({ message: "Logged out successfully" });
};
