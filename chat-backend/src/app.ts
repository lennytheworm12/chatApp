import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth.routes.js';
import contactRouter from './routes/contact.routes.js';
import messageRouter from './routes/messages.routes.js';
import channelRouter from './routes/channel.routes.js';
import { getCorsOptions } from './config.js';

export interface CreateAppOptions {
    /**
     * Directory containing the built frontend. Defaults to chat-frontend/dist
     * in production; tests inject a fixture to avoid depending on a checked-in
     * build.
     */
    staticDir?: string;
}

// In both the source tree (src/) and the compiled output (dist/) this module
// sits one level inside chat-backend/, so the built frontend is two parents
// up, then chat-frontend/dist. Resolving from the module URL keeps serving
// correct regardless of the process working directory.
const getDefaultStaticDir = (): string => {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    return resolve(moduleDir, '..', '..', 'chat-frontend', 'dist');
};

// SPA fallback applies only to browser HTML GET routes: extensionless paths
// that do not belong to the API or Socket.IO. Unknown /api routes, non-HTML
// Accept headers, and file-like requests (e.g. a missing asset) must 404
// instead of silently receiving index.html.
const isSpaHtmlRequest = (req: Request): boolean => {
    if (req.method !== 'GET') return false;
    if (!req.accepts('html')) return false;
    const pathname = req.path;
    if (pathname.startsWith('/api') || pathname.startsWith('/socket.io')) return false;
    return extname(pathname) === '';
};

export const createApp = (options: CreateAppOptions = {}): express.Express => {
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

    // Production-only static serving. API routes and /health stay registered
    // first; the built SPA is then served from disk with an HTML fallback for
    // browser routes. Socket.IO attaches at the HTTP server level and handles
    // /socket.io before this middleware sees it; the fallback skips it too.
    const isProduction = process.env.NODE_ENV === 'production';
    const staticDir = options.staticDir ?? (isProduction ? getDefaultStaticDir() : undefined);
    if (staticDir) {
        app.use(express.static(staticDir));
        app.use((req, res, next) => {
            if (!isSpaHtmlRequest(req)) {
                next();
                return;
            }
            res.sendFile(join(staticDir, 'index.html'));
        });
    }

    return app;
};
