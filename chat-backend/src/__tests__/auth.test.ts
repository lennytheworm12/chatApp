import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
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
            await collections[key]!.deleteMany({});
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

        it('should reject passwords shorter than 8 characters', async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    email: 'shortpass@example.com',
                    password: '1234567'
                });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('message', 'Password must be between 8 and 72 characters');
        });

        it('should reject passwords longer than 72 characters', async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    email: 'longpass@example.com',
                    password: 'p'.repeat(73)
                });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('message', 'Password must be between 8 and 72 characters');
        });

        it('should accept a password of exactly 8 characters', async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    email: 'minpass@example.com',
                    password: '12345678'
                });

            expect(response.status).toBe(201);
        });

        it('should accept a password of exactly 72 characters', async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    email: 'maxpass@example.com',
                    password: 'p'.repeat(72)
                });

            expect(response.status).toBe(201);
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

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message', 'Invalid email or password');
        });

        it('should reject non-existent user', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'password123'
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message', 'Invalid email or password');
        });

        it('should authenticate a pre-existing password shorter than 8 characters', async () => {
            const passwordHash = await bcrypt.hash('short', 10);
            await UserModel.create({
                email: 'legacy-short@example.com',
                password: passwordHash
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'legacy-short@example.com',
                    password: 'short'
                });

            expect(response.status).toBe(200);
            expect(response.body.user).toHaveProperty('email', 'legacy-short@example.com');
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

        it('should return 401 when the JWT cookie cannot be verified', async () => {
            const response = await request(app)
                .get('/api/auth/userinfo')
                .set('Cookie', 'jwt=not-a-jwt');

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message', 'could not verify user');
        });

        it('should return 401 when a verified token carries no userId', async () => {
            const forgedToken = jwt.sign({}, process.env.JWT_SECRET!);

            const response = await request(app)
                .get('/api/auth/userinfo')
                .set('Cookie', `jwt=${forgedToken}`);

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message', 'Not authenticated');
        });

        it('should return 401 when a verified userId is not a valid ObjectId', async () => {
            const forgedToken = jwt.sign({ userId: 'not-an-id' }, process.env.JWT_SECRET!);

            const response = await request(app)
                .get('/api/auth/userinfo')
                .set('Cookie', `jwt=${forgedToken}`);

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message', 'Not authenticated');
        });

        it('should return 500 when database fails during userinfo', async () => {
            const agent = await createAuthenticatedUser('test@example.com', 'password123');
            jest.spyOn(UserModel, 'findById').mockImplementationOnce(() => {
                throw new Error('Database connection lost');
            });

            const response = await agent.get('/api/auth/userinfo');

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('message', 'could not retrieve user');

            jest.restoreAllMocks();
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

        it('should reject non-string firstName and lastName', async () => {
            const agent = await createAuthenticatedUser('test@example.com', 'password123');

            const response = await agent
                .post('/api/auth/update-profile')
                .send({ firstName: 123, lastName: { name: 'Doe' } });

            expect(response.status).toBe(400);
        });

        it('should reject profile names that exceed the length limit', async () => {
            const agent = await createAuthenticatedUser('test@example.com', 'password123');

            const longFirstName = await agent
                .post('/api/auth/update-profile')
                .send({ firstName: 'J'.repeat(51), lastName: 'Doe' });
            expect(longFirstName.status).toBe(400);
            expect(longFirstName.body).toHaveProperty('message', 'Invalid or missing required fields');

            const longLastName = await agent
                .post('/api/auth/update-profile')
                .send({ firstName: 'John', lastName: 'D'.repeat(51) });
            expect(longLastName.status).toBe(400);
            expect(longLastName.body).toHaveProperty('message', 'Invalid or missing required fields');
        });

        it('should reject whitespace-only firstName and lastName', async () => {
            const agent = await createAuthenticatedUser('test@example.com', 'password123');

            const response = await agent
                .post('/api/auth/update-profile')
                .send({ firstName: '   ', lastName: '\t' });

            expect(response.status).toBe(400);
        });

        it('should reject invalid color values but keep color optional', async () => {
            const agent = await createAuthenticatedUser('test@example.com', 'password123');

            const invalidColorResponse = await agent
                .post('/api/auth/update-profile')
                .send({ firstName: 'John', lastName: 'Doe', color: 42 });
            expect(invalidColorResponse.status).toBe(400);

            const whitespaceColorResponse = await agent
                .post('/api/auth/update-profile')
                .send({ firstName: 'John', lastName: 'Doe', color: '   ' });
            expect(whitespaceColorResponse.status).toBe(400);

            const longColorResponse = await agent
                .post('/api/auth/update-profile')
                .send({ firstName: 'John', lastName: 'Doe', color: 'x'.repeat(101) });
            expect(longColorResponse.status).toBe(400);

            const noColorResponse = await agent
                .post('/api/auth/update-profile')
                .send({ firstName: 'Jane', lastName: 'Roe' });
            expect(noColorResponse.status).toBe(200);
            expect(noColorResponse.body.user).toHaveProperty('firstName', 'Jane');
            expect(noColorResponse.body.user).toHaveProperty('lastName', 'Roe');
            expect(noColorResponse.body.user).toHaveProperty('profileSetup', true);
        });

        it('should trim valid firstName, lastName, and color values', async () => {
            const agent = await createAuthenticatedUser('test@example.com', 'password123');

            const response = await agent
                .post('/api/auth/update-profile')
                .send({
                    firstName: '  John  ',
                    lastName: ' Doe ',
                    color: '  #ff5733  '
                });

            expect(response.status).toBe(200);
            expect(response.body.user).toHaveProperty('firstName', 'John');
            expect(response.body.user).toHaveProperty('lastName', 'Doe');
            expect(response.body.user).toHaveProperty('color', '#ff5733');
        });

        it('should return 404 when the user no longer exists', async () => {
            const agent = await createAuthenticatedUser('test@example.com', 'password123');

            // Delete the user from the database while the JWT cookie is still valid
            await mongoose.connection.collection('users').deleteMany({});

            const response = await agent
                .post('/api/auth/update-profile')
                .send({ firstName: 'John', lastName: 'Doe' });

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('message', 'unable to find user');
        });

        it('should return 500 when database fails during profile update', async () => {
            const agent = await createAuthenticatedUser('test@example.com', 'password123');
            jest.spyOn(UserModel, 'findByIdAndUpdate').mockImplementationOnce(() => {
                throw new Error('Database write failed');
            });

            const response = await agent
                .post('/api/auth/update-profile')
                .send({ firstName: 'John', lastName: 'Doe' });

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('message', 'failed to update the profile');

            jest.restoreAllMocks();
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
    describe('Auth input validation', () => {
        it('should reject invalid email format in signup', async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({ email: 'not-an-email', password: 'password123' });

            expect(response.status).toBe(400);
        });

        it('should reject invalid email format in login', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ email: 'not-an-email', password: 'password123' });

            expect(response.status).toBe(400);
        });

        it('should normalize email to lowercase/trimmed on signup and allow login with it', async () => {
            const signup = await request(app)
                .post('/api/auth/signup')
                .send({ email: '  Test@Example.COM  ', password: 'password123' });

            expect(signup.status).toBe(201);
            expect(signup.body.user).toHaveProperty('email', 'test@example.com');

            const login = await request(app)
                .post('/api/auth/login')
                .send({ email: 'TEST@EXAMPLE.COM', password: 'password123' });

            expect(login.status).toBe(200);
        });

        it('should not leak the password hash in login response', async () => {
            await request(app).post('/api/auth/signup').send({
                email: 'leakcheck@example.com',
                password: 'password123'
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send({ email: 'leakcheck@example.com', password: 'password123' });

            expect(response.status).toBe(200);
            expect(response.body.user).not.toHaveProperty('password');
        });

        it('should not leak the password hash in userinfo response', async () => {
            const agent = await createAuthenticatedUser('leakcheck2@example.com', 'password123');

            const response = await agent.get('/api/auth/userinfo');

            expect(response.status).toBe(200);
            expect(response.body.user).not.toHaveProperty('password');
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
