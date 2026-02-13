//requests regarding auth will be routed here
//
//
//
import express from 'express';
import {loginUser} from '../controllers/auth.login.js';
import {registerUser} from '../controllers/auth.register.js';

const router : express.Router= express.Router();

//add in routes like login
router.post('\register', registerUser);
router.post('\login', loginUser);

//const export authRouter;
export default router;
