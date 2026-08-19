import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth.routes.js';
import contactRouter from './routes/contact.routes.js';
import messageRouter from './routes/messages.routes.js';
import channelRouter from './routes/channel.routes.js';
import { getCorsOptions } from './config.js';

export const createApp = (): express.Express => {
    const app = express();

    app.use(express.json());
    app.use(cookieParser());
    app.use(cors(getCorsOptions()));

    app.use('/api/auth', authRouter);
    app.use('/api/contacts', contactRouter);
    app.use('/api/messages', messageRouter);
    app.use('/api/channel', channelRouter);

    app.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok' });
    });

    return app;
};
