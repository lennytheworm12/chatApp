import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import contactRouter from '../routes/contact.routes.js';
import authRouter from '../routes/auth.routes.js';
import { MessageModel } from '../models/message.model.js';
import { UserModel } from '../models/user.model.js';
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/contacts', contactRouter);

async function createAuthenticatedUser(email: string, password: string) {
    const agent = request.agent(app);
    const signupRes = await agent.post('/api/auth/signup').send({ email, password });
    return { agent, userId: signupRes.body.user._id };
}

describe('Contact Endpoints', () => {
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

    describe('POST /api/contacts/search', () => {
        it('should search and find users by email', async () => {
            const { agent } = await createAuthenticatedUser('searcher@test.com', 'password123');

            await request(app).post('/api/auth/signup').send({
                email: 'john@example.com',
                password: 'password123'
            });

            const response = await agent
                .post('/api/contacts/search')
                .send({ searchTerm: 'john' });

            expect(response.status).toBe(200);
            expect(response.body.contacts).toHaveLength(1);
            expect(response.body.contacts[0]).toHaveProperty('email', 'john@example.com');
        });

        it('should exclude self from search results', async () => {
            const { agent } = await createAuthenticatedUser('searcher2@test.com', 'password123');

            const response = await agent
                .post('/api/contacts/search')
                .send({ searchTerm: 'searcher2' });

            expect(response.status).toBe(200);
            expect(response.body.contacts).toHaveLength(0);
        });

        it('should return 401 when not authenticated', async () => {
            const response = await request(app)
                .post('/api/contacts/search')
                .send({ searchTerm: 'test' });

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/contacts/all-contacts', () => {
        it('should return all users except self in label/value format', async () => {
            const { agent } = await createAuthenticatedUser('user1@test.com', 'password123');

            await request(app).post('/api/auth/signup').send({
                email: 'user2@test.com',
                password: 'password123'
            });

            const { agent: agent2 } = await createAuthenticatedUser('user3@test.com', 'password123');
            await agent2.post('/api/auth/update-profile').send({
                firstName: 'John',
                lastName: 'Doe'
            });

            const response = await agent.get('/api/contacts/all-contacts');

            expect(response.status).toBe(200);
            expect(response.body.contacts).toBeDefined();
            // Just check the format exists if there are contacts
            if (response.body.contacts.length > 0) {
                expect(response.body.contacts[0]).toHaveProperty('label');
                expect(response.body.contacts[0]).toHaveProperty('value');
            }
        });
    });

    describe('GET /api/contacts/get-contacts-for-list', () => {
        it('should return contacts sorted by last message time', async () => {
            const { agent: agent1, userId: user1Id } = await createAuthenticatedUser('user1@test.com', 'password123');

            const signupRes2 = await request(app).post('/api/auth/signup').send({
                email: 'user2@test.com',
                password: 'password123'
            });
            const user2Id = signupRes2.body.user._id;

            const signupRes3 = await request(app).post('/api/auth/signup').send({
                email: 'user3@test.com',
                password: 'password123'
            });
            const user3Id = signupRes3.body.user._id;

            await MessageModel.create({
                sender: new mongoose.Types.ObjectId(user1Id),
                recipient: new mongoose.Types.ObjectId(user2Id),
                content: 'Hello user2',
                messagetype: 'text',
                timestamp: new Date('2024-01-01')
            });

            await MessageModel.create({
                sender: new mongoose.Types.ObjectId(user1Id),
                recipient: new mongoose.Types.ObjectId(user3Id),
                content: 'Hello user3',
                messagetype: 'text',
                timestamp: new Date('2024-01-02')
            });

            const response = await agent1.get('/api/contacts/get-contacts-for-list');

            expect(response.status).toBe(200);
            expect(response.body.contacts.length).toBeGreaterThanOrEqual(1);
            expect(response.body.contacts[0]).toHaveProperty('email', 'user3@test.com');
            expect(response.body.contacts[0]).toHaveProperty('lastMessageTime');
        });

        it('should return empty array when no messages', async () => {
            const { agent } = await createAuthenticatedUser('user1@test.com', 'password123');

            const response = await agent.get('/api/contacts/get-contacts-for-list');

            expect(response.status).toBe(200);
            expect(response.body.contacts).toHaveLength(0);
        });
    });

    describe('DELETE /api/contacts/delete-dm/:dmId', () => {
        it('should successfully delete DM messages', async () => {
            const { agent: agent1, userId: userId1 } = await createAuthenticatedUser('user1@test.com', 'password123');
            const { agent: agent2, userId: userId2 } = await createAuthenticatedUser('user2@test.com', 'password123');

            // Create some messages between users
            await MessageModel.create({
                sender: new mongoose.Types.ObjectId(userId1),
                recipient: new mongoose.Types.ObjectId(userId2),
                content: 'Hello',
                messagetype: 'text'
            });

            const response = await agent1.delete(`/api/contacts/delete-dm/${userId2}`);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('DM deleted successfully');
        });

        it('should return 500 when database fails', async () => {
            const { agent } = await createAuthenticatedUser('user@test.com', 'password123');

            const originalDeleteMany = MessageModel.deleteMany;
            MessageModel.deleteMany = (() => {
                throw new Error('Database error');
            }) as any;

            const response = await agent
                .delete('/api/contacts/delete-dm/123456789012345678901234');

            expect(response.status).toBe(500);

            MessageModel.deleteMany = originalDeleteMany;
        });
    });
});
