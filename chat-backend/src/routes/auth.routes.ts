//requests regarding auth will be routed here
//
//
//
import express from 'express';
import { loginUser } from '../controllers/auth.login.js';
import { registerUser } from '../controllers/auth.register.js';
import { logoutUser } from '../controllers/auth.logout.js';
import { verifyUser } from '../middleware/auth.middleware.js';
import { updateProfile } from "../controllers/auth.updateProfile.js";
import { getUserInfo } from "../controllers/auth.getUserInfo.js";
import {searchForUsers} from "../controllers/auth.searchForUsers.js";

const router: express.Router = express.Router();

//add in routes like login
router.post('/register', registerUser);
router.post('/login', loginUser);

//after we verify the user req.userId is an existing field
router.post('/logout', verifyUser, logoutUser);
router.post('/update-profile', verifyUser, updateProfile);
router.get('/userinfo', verifyUser, getUserInfo);//required black box spec
router.get('/search', verifyUser, searchForUsers); //searchs the db for users




//const export authRouter;
export default router; 
