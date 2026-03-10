import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import messageRouter from '../routes/messages.routes.js';
import authRouter from '../routes/auth.routes.js';
import { MessageModel } from '../models/message.model.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/messages', messageRouter);

async function createAuthenticatedUser(email: string, password: string) {
    const agent = request.agent(app);
    const signupRes = await agent.post('/api/auth/signup').send({ email, password });
    return { agent, userId: signupRes.body.user._id };
}

describe('Message Endpoints', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URL || '');
    }, 30000);

    afterAll(async () => {
        await mongoose.connection.close();
    });

    afterEach(async () => {
        if (!mongoose.connection.collections) return;

        const collections = mongoose.connection.collections;
        for (const key in collections) {
            await collections[key]!.deleteMany({});
        }
    });

    describe('POST /api/messages/get-messages', () => {
        it('should return messages between two users', async () => {
            const { agent: agent1, userId: user1Id } = await createAuthenticatedUser('user1@test.com', 'password123');

            const signupRes2 = await request(app).post('/api/auth/signup').send({
                email: 'user2@test.com',
                password: 'password123'
            });
            const user2Id = signupRes2.body.user._id;

            // Create messages with proper ObjectId conversion
            await MessageModel.create({
                sender: new mongoose.Types.ObjectId(user1Id),
                recipient: new mongoose.Types.ObjectId(user2Id),
                content: 'Hello!',
                messagetype: 'text',
                timestamp: new Date('2024-01-01')
            });

            await MessageModel.create({
                sender: new mongoose.Types.ObjectId(user2Id),
                recipient: new mongoose.Types.ObjectId(user1Id),
                content: 'Hi there!',
                messagetype: 'text',
                timestamp: new Date('2024-01-02')
            });

            const response = await agent1
                .post('/api/messages/get-messages')
                .send({ id: user2Id });

            expect(response.status).toBe(200);
            expect(response.body.messages).toHaveLength(2);
            expect(response.body.messages[0]).toHaveProperty('content', 'Hello!');
            expect(response.body.messages[1]).toHaveProperty('content', 'Hi there!');
        });

        it('should return empty array when no messages', async () => {
            const { agent: agent1 } = await createAuthenticatedUser('user1@test.com', 'password123');

            const signupRes2 = await request(app).post('/api/auth/signup').send({
                email: 'user2@test.com',
                password: 'password123'
            });
            const user2Id = signupRes2.body.user._id;

            const response = await agent1
                .post('/api/messages/get-messages')
                .send({ id: user2Id });

            expect(response.status).toBe(200);
            expect(response.body.messages).toHaveLength(0);
        });

        it('should return 401 when not authenticated', async () => {
            const response = await request(app)
                .post('/api/messages/get-messages')
                .send({ id: '123' });

            expect(response.status).toBe(401);
        });
    });
    it('should return 500 when id is invalid format', async () => {
        const { agent } = await createAuthenticatedUser('user@test.com', 'password123');

        const response = await agent
            .post('/api/messages/get-messages')
            .send({ id: 'invalid' });

        // Returns 500 because Mongoose can't cast invalid ObjectId
        expect(response.status).toBe(500);
    });
});
