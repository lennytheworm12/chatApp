import request from 'supertest';
import { createApp } from '../app.js';

describe('createApp', () => {
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
});
