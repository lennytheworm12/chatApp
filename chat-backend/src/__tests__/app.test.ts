import request from 'supertest';
import { createApp } from '../app.js';

describe('createApp', () => {
    const savedOrigin = process.env.CLIENT_ORIGIN;

    afterAll(() => {
        if (savedOrigin === undefined) {
            delete process.env.CLIENT_ORIGIN;
        } else {
            process.env.CLIENT_ORIGIN = savedOrigin;
        }
    });

    it('serves the health endpoint without listening or connecting', async () => {
        const app = createApp();
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'ok' });
    });

    it('serves the channel placeholder route', async () => {
        const app = createApp();
        const response = await request(app).get('/api/channel/get-user-channels');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ channels: [] });
    });

    it('reflects a configured origin and allows no-Origin clients', async () => {
        process.env.CLIENT_ORIGIN = 'http://localhost:3000';
        const app = createApp();

        const allowed = await request(app)
            .get('/health')
            .set('Origin', 'http://localhost:3000');
        expect(allowed.status).toBe(200);
        expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
        expect(allowed.headers['access-control-allow-credentials']).toBe('true');

        const noOrigin = await request(app).get('/health');
        expect(noOrigin.status).toBe(200);
    });

    it('supports comma-separated deployment origins', async () => {
        process.env.CLIENT_ORIGIN = 'http://localhost:3000, https://app.example.com';
        const app = createApp();

        for (const origin of ['http://localhost:3000', 'https://app.example.com']) {
            const response = await request(app).get('/health').set('Origin', origin);
            expect(response.status).toBe(200);
            expect(response.headers['access-control-allow-origin']).toBe(origin);
        }
    });

    it('rejects unlisted browser origins', async () => {
        process.env.CLIENT_ORIGIN = 'http://localhost:3000';
        const app = createApp();

        const response = await request(app)
            .get('/health')
            .set('Origin', 'http://evil.example');
        expect(response.status).toBe(500);
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
});
