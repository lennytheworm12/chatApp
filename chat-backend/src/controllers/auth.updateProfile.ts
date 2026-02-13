//method to update a users profile
//
//

import type { Request, Response } from 'express';
import type { UpdateProfileData } from '../types/auth.types.js';
import { UserModel } from "../models/user.model.js";

//given a request from the client with new user info update 
//async function since we need to check with the database
export const updateProfile = async (req: Request<{}, {}, UpdateProfileData>, res: Response) => {

    //find the user in the data base and update it
    try {
        const user = await UserModel.findByIdAndUpdate(req.userId,
            {
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                color: req.body.color,
                profileSetup: true,
            },
            { new: true }
        );


        if (!user) return res.status(404).json({ message: "unable to find user" });
        return res.status(200).json({user: user});



    } catch (error) {
        console.error("updated user profile", error);
        return res.status(500).json({message: "failed to update the profile"});

    }
}
