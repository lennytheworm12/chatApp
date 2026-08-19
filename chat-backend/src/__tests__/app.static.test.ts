import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../app.js';

describe('createApp production static serving', () => {
    const savedNodeEnv = process.env.NODE_ENV;
    let staticDir: string;

    beforeEach(() => {
        staticDir = mkdtempSync(join(tmpdir(), 'chat-app-static-'));
        mkdirSync(join(staticDir, 'assets'), { recursive: true });
        writeFileSync(
            join(staticDir, 'index.html'),
            '<!doctype html><html><head><title>Portfolio DM</title></head><body><div id="root"></div></body></html>',
            'utf8',
        );
        writeFileSync(join(staticDir, 'assets', 'app.js'), 'console.log("app");', 'utf8');
        process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
        rmSync(staticDir, { recursive: true, force: true });
        if (savedNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = savedNodeEnv;
        }
    });

    it('serves the frontend at the root', async () => {
        const app = createApp({ staticDir });
        const response = await request(app).get('/');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/text\/html/);
        expect(response.text).toContain('<div id="root"></div>');
    });

    it('serves built assets from the static directory', async () => {
        const app = createApp({ staticDir });
        const response = await request(app).get('/assets/app.js');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/javascript/);
        expect(response.text).toBe('console.log("app");');
    });

    it('falls back to index.html for browser HTML GET routes', async () => {
        const app = createApp({ staticDir });
        const response = await request(app)
            .get('/some/client/route')
            .set('Accept', 'text/html');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/text\/html/);
        expect(response.text).toContain('<div id="root"></div>');
    });

    it('does not return index.html for unknown /api routes', async () => {
        const app = createApp({ staticDir });
        const response = await request(app)
            .get('/api/does-not-exist')
            .set('Accept', 'text/html');

        expect(response.status).toBe(404);
        expect(response.text).not.toContain('<div id="root"></div>');
    });

    it('does not return index.html for non-HTML requests', async () => {
        const app = createApp({ staticDir });

        const fileLike = await request(app).get('/assets/missing.js');
        expect(fileLike.status).toBe(404);
        expect(fileLike.text).not.toContain('<div id="root"></div>');

        const jsonOnly = await request(app)
            .get('/some/client/route')
            .set('Accept', 'application/json');
        expect(jsonOnly.status).toBe(404);
        expect(jsonOnly.text).not.toContain('<div id="root"></div>');
    });

    it('does not return index.html for non-GET requests', async () => {
        const app = createApp({ staticDir });
        const response = await request(app)
            .post('/some/client/route')
            .set('Accept', 'text/html');

        expect(response.status).toBe(404);
        expect(response.text).not.toContain('<div id="root"></div>');
    });

    it('leaves Socket.IO handshake paths alone', async () => {
        const app = createApp({ staticDir });
        const response = await request(app)
            .get('/socket.io/?EIO=4&transport=polling&t=123')
            .set('Accept', 'text/html');

        expect(response.status).toBe(404);
        expect(response.text).not.toContain('<div id="root"></div>');
    });

    it('uses an explicit static directory outside production too', async () => {
        process.env.NODE_ENV = 'development';
        const app = createApp({ staticDir });
        const response = await request(app).get('/');

        expect(response.status).toBe(200);
        expect(response.text).toContain('<div id="root"></div>');
    });
});
