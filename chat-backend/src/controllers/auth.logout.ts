//this controller handles logging out the user/wiping their jwt token from cookie
//
//
//

import type { Request, Response } from 'express';


export const logoutUser = async (_req: Request , res: Response) => {
    //given a request from a user currently with cookies just respond with cleared cookies

    res.clearCookie('jwt');
    return res.status(200).json({message: "logged out "});
}
