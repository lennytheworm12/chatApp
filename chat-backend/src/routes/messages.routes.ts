
import express from 'express';

import { verifyUser } from '../middleware/auth.middleware.js';
import {getMessages} from "../controllers/messages.getMessages.js";
const router: express.Router = express.Router();

router.post('/get-messages', verifyUser, getMessages);

export default router;
