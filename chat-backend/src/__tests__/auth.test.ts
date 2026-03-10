import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import authRouter from '../routes/auth.routes.js';
import { UserModel } from "../models/user.model.js";
import {jest} from '@jest/globals';
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);

async function createAuthenticatedUser(email: string, password: string) {
    const agent = request.agent(app);
    await agent.post('/api/auth/signup').send({ email, password });
    return agent;
}

describe('Auth Endpoints', () => {
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
            await collections[key].deleteMany({});
        }
    });

    describe('POST /api/auth/signup', () => {
        it('should create a new user', async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

            expect(response.status).toBe(201);
            expect(response.body.user).toHaveProperty('email', 'test@example.com');
            expect(response.body.user).toHaveProperty('profileSetup', false);
        });

        it('should reject duplicate email', async () => {
            await request(app).post('/api/auth/signup').send({
                email: 'test@example.com',
                password: 'password123'
            });

            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    email: 'test@example.com',
                    password: 'different'
                });

            expect(response.status).toBe(409);
        });
    });

    describe('POST /api/auth/login', () => {
        it('should login with correct credentials', async () => {
            await request(app).post('/api/auth/signup').send({
                email: 'test@example.com',
                password: 'password123'
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

            expect(response.status).toBe(200);
            expect(response.body.user).toHaveProperty('email', 'test@example.com');
        });

        it('should reject wrong password', async () => {
            await request(app).post('/api/auth/signup').send({
                email: 'test@example.com',
                password: 'password123'
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(400);
        });

        it('should reject non-existent user', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'password123'
                });

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/auth/logout', () => {
        it('should logout user successfully', async () => {
            const agent = await createAuthenticatedUser('test@example.com', 'password123');

            const response = await agent.post('/api/auth/logout');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Logged out successfully');
        });
    });

    describe('GET /api/auth/userinfo', () => {
        it('should return user info when authenticated', async () => {
            const agent = await createAuthenticatedUser('test@example.com', 'password123');

            const response = await agent.get('/api/auth/userinfo');

            expect(response.status).toBe(200);
            expect(response.body.user).toHaveProperty('email', 'test@example.com');
            expect(response.body.user).toHaveProperty('profileSetup', false);
        });

        it('should return 401 when not authenticated', async () => {
            const response = await request(app).get('/api/auth/userinfo');

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/auth/update-profile', () => {
        it('should update user profile', async () => {
            const agent = await createAuthenticatedUser('test@example.com', 'password123');

            const response = await agent
                .post('/api/auth/update-profile')
                .send({
                    firstName: 'John',
                    lastName: 'Doe',
                    color: '#ff5733'
                });

            expect(response.status).toBe(200);
            expect(response.body.user).toHaveProperty('firstName', 'John');
            expect(response.body.user).toHaveProperty('lastName', 'Doe');
            expect(response.body.user).toHaveProperty('color', '#ff5733');
            expect(response.body.user).toHaveProperty('profileSetup', true);
        });

        it('should return 401 when not authenticated', async () => {
            const response = await request(app)
                .post('/api/auth/update-profile')
                .send({ firstName: 'John', lastName: 'Doe' });

            expect(response.status).toBe(401);
        });

        it('should return 400 when missing required fields', async () => {
            const agent = await createAuthenticatedUser('test@example.com', 'password123');

            const response = await agent
                .post('/api/auth/update-profile')
                .send({ lastName: 'Doe' });

            expect(response.status).toBe(400);
        });
    });
    describe('Error handling', () => {
        it('should handle missing email in signup', async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({ password: 'password123' });

            expect(response.status).toBe(400);
        });

        it('should handle missing password in signup', async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({ email: 'test@example.com' });

            expect(response.status).toBe(400);
        });

        it('should handle missing email in login', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ password: 'password123' });

            expect(response.status).toBe(400);
        });

        it('should handle missing password in login', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com' });

            expect(response.status).toBe(400);
        });
    });
    it('should return 404  when user is deleted but JWT is still valid', async () => {
        const agent = await createAuthenticatedUser('test@example.com', 'password123');

        // Delete the user from database while JWT cookie is still valid
        await mongoose.connection.collection('users').deleteMany({});

        const response = await agent.get('/api/auth/userinfo');

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('message', 'user was not found');
    });
    it('should return 500 when database fails during login', async () => {
        // Mock UserModel.findOne to throw a database error
        jest.spyOn(UserModel, 'findOne').mockImplementationOnce(() => {
            throw new Error('Database connection lost');
        });

        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test@example.com',
                password: 'password123'
            });

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('message', 'Login failed');

        // Restore the original implementation
        jest.restoreAllMocks();
    });
    it('should return 500 when database fails during registration', async () => {
        jest.spyOn(UserModel.prototype, 'save').mockImplementationOnce(() => {
            throw new Error('Database write failed');
        });

        const response = await request(app)
            .post('/api/auth/signup')
            .send({
                email: 'test@example.com',
                password: 'password123'
            });

        expect(response.status).toBe(500);

        jest.restoreAllMocks();
    });
});
