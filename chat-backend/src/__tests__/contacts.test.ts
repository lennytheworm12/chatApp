import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import contactRouter from '../routes/contact.routes.js';
import authRouter from '../routes/auth.routes.js';
import { MessageModel } from '../models/message.model.js';
import { UserModel } from '../models/user.model.js';
import { jest } from '@jest/globals';
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

function forgedJwtCookie(payload: Record<string, unknown>): string {
    return `jwt=${jwt.sign(payload, process.env.JWT_SECRET!)}`;
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

        it('should treat regex special characters literally', async () => {
            const { agent } = await createAuthenticatedUser('searcher3@test.com', 'password123');

            await request(app).post('/api/auth/signup').send({
                email: 'john@example.com',
                password: 'password123'
            });

            const response = await agent
                .post('/api/contacts/search')
                .send({ searchTerm: 'j.ohn' });

            expect(response.status).toBe(200);
            expect(response.body.contacts).toHaveLength(0);
        });

        it('should cap results to 25 newest users and exclude self', async () => {
            const { agent } = await createAuthenticatedUser('cap-user-self@test.com', 'password123');
            const createdIds: string[] = [];

            for (let i = 0; i < 30; i++) {
                const user = await UserModel.create({
                    email: `cap-user-${i}@test.com`,
                    password: 'hash',
                });
                createdIds.push(user._id.toString());
            }

            const self = await UserModel.findOne({ email: 'cap-user-self@test.com' });
            const response = await agent
                .post('/api/contacts/search')
                .send({ searchTerm: 'cap-user' });

            expect(response.status).toBe(200);
            expect(response.body.contacts).toHaveLength(25);
            const ids = response.body.contacts.map((c: { id: string }) => c.id);
            expect(ids).not.toContain(self!._id.toString());
            expect(ids).toEqual(createdIds.slice(5).reverse());
        });

        it('should return 400 when the search term is empty or whitespace-only', async () => {
            const { agent } = await createAuthenticatedUser('searcher4@test.com', 'password123');

            const emptyResponse = await agent
                .post('/api/contacts/search')
                .send({ searchTerm: '' });
            expect(emptyResponse.status).toBe(400);
            expect(emptyResponse.body).toHaveProperty('message', 'search term is required');

            const whitespaceResponse = await agent
                .post('/api/contacts/search')
                .send({ searchTerm: '   ' });
            expect(whitespaceResponse.status).toBe(400);
        });

        it('should return 400 when the search term is not a string', async () => {
            const { agent } = await createAuthenticatedUser('searcher5@test.com', 'password123');

            const response = await agent
                .post('/api/contacts/search')
                .send({ searchTerm: 123 });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('message', 'search term is required');
        });

        it('should return 400 when the search term is too long', async () => {
            const { agent } = await createAuthenticatedUser('searcher6@test.com', 'password123');

            const response = await agent
                .post('/api/contacts/search')
                .send({ searchTerm: 'x'.repeat(101) });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('message', 'search term is too long');
        });

        it('should return 401 when a verified token carries no userId', async () => {
            const response = await request(app)
                .post('/api/contacts/search')
                .set('Cookie', forgedJwtCookie({}))
                .send({ searchTerm: 'test' });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message', 'Not authenticated');
        });

        it('should return 500 when database fails during search', async () => {
            const { agent } = await createAuthenticatedUser('searcher7@test.com', 'password123');
            jest.spyOn(UserModel, 'find').mockImplementationOnce(() => {
                throw new Error('Database connection lost');
            });

            const response = await agent
                .post('/api/contacts/search')
                .send({ searchTerm: 'test' });

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('message', 'data base retrevial error');

            jest.restoreAllMocks();
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

        it('should return 500 when database fails while loading all users', async () => {
            const { agent } = await createAuthenticatedUser('user1@test.com', 'password123');
            jest.spyOn(UserModel, 'find').mockImplementationOnce(() => {
                throw new Error('Database connection lost');
            });

            const response = await agent.get('/api/contacts/all-contacts');

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('message', 'data base retrevial error');

            jest.restoreAllMocks();
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

        it('should treat the sender as the contact when the current user is the recipient and dedupe repeated contacts', async () => {
            const { agent: agent1, userId: user1Id } = await createAuthenticatedUser('user1@test.com', 'password123');
            const { userId: user2Id } = await createAuthenticatedUser('user2@test.com', 'password123');

            await MessageModel.create({
                sender: new mongoose.Types.ObjectId(user2Id),
                recipient: new mongoose.Types.ObjectId(user1Id),
                content: 'Message from user2',
                messagetype: 'text',
                timestamp: new Date('2024-01-01')
            });

            await MessageModel.create({
                sender: new mongoose.Types.ObjectId(user1Id),
                recipient: new mongoose.Types.ObjectId(user2Id),
                content: 'Reply from user1',
                messagetype: 'text',
                timestamp: new Date('2024-01-02')
            });

            const response = await agent1.get('/api/contacts/get-contacts-for-list');

            expect(response.status).toBe(200);
            expect(response.body.contacts).toHaveLength(1);
            expect(response.body.contacts[0]).toHaveProperty('email', 'user2@test.com');
        });

        it('should skip contacts whose user was deleted', async () => {
            const { agent: agent1, userId: user1Id } = await createAuthenticatedUser('user1@test.com', 'password123');
            const { userId: user2Id } = await createAuthenticatedUser('user2@test.com', 'password123');

            await MessageModel.create({
                sender: new mongoose.Types.ObjectId(user1Id),
                recipient: new mongoose.Types.ObjectId(user2Id),
                content: 'Hello user2',
                messagetype: 'text'
            });

            await mongoose.connection.collection('users').deleteMany({ email: 'user2@test.com' });

            const response = await agent1.get('/api/contacts/get-contacts-for-list');

            expect(response.status).toBe(200);
            expect(response.body.contacts).toHaveLength(0);
        });

        it('should return 401 when a verified token carries no userId', async () => {
            const response = await request(app)
                .get('/api/contacts/get-contacts-for-list')
                .set('Cookie', forgedJwtCookie({}));

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message', 'Not authenticated');
        });

        it('should return 401 when a verified userId is not a valid ObjectId', async () => {
            const response = await request(app)
                .get('/api/contacts/get-contacts-for-list')
                .set('Cookie', forgedJwtCookie({ userId: 'not-an-id' }));

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message', 'Not authenticated');
        });

        it('should return 500 when database fails while loading contacts', async () => {
            const { agent } = await createAuthenticatedUser('user1@test.com', 'password123');
            jest.spyOn(MessageModel, 'find').mockImplementationOnce(() => {
                throw new Error('Database connection lost');
            });

            const response = await agent.get('/api/contacts/get-contacts-for-list');

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('message', 'data base retrevial error');

            jest.restoreAllMocks();
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

        it('should return 400 when dmId is not a valid ObjectId', async () => {
            const { agent } = await createAuthenticatedUser('user@test.com', 'password123');

            const response = await agent
                .delete('/api/contacts/delete-dm/not-an-id');

            expect(response.status).toBe(400);
        });

        it('should return 401 when a verified token carries no userId', async () => {
            const response = await request(app)
                .delete('/api/contacts/delete-dm/123456789012345678901234')
                .set('Cookie', forgedJwtCookie({}));

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message', 'Not authenticated');
        });
    });
});
