import express from 'express';

import type { Request, Response } from 'express';
const router: express.Router = express.Router();

const temp = (_req: Request, res: Response) => {

    return res.status(200).json({ channels: [] });
}
router.get('/get-user-channels', temp);


//temp func
export default router; 
