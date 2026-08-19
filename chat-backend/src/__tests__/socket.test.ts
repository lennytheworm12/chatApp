import { createServer } from 'http';
import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MessageModel } from '../models/message.model.js';
import { UserModel } from '../models/user.model.js';
import {
    authenticateSocket,
    createSocketServer,
    getSocketToken,
    handleSendMessage,
    registerSocketHandlers,
} from '../socket/index.js';
import type { ChatServer, ChatSocket, SendMessageAck, SendMessagePayload } from '../socket/index.js';

const JWT_SECRET = 'socket-test-secret';
const validUserId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();

const createFakeSocket = (
    userId: string,
    overrides: Partial<{ token: string; cookie: string }> = {},
) => ({
    data: { userId },
    handshake: {
        auth: overrides.token ? { token: overrides.token } : {},
        headers: overrides.cookie ? { cookie: overrides.cookie } : {},
    },
    emit: jest.fn(),
    join: jest.fn(),
    on: jest.fn(),
});

const createFakeIo = (emit = jest.fn()) => ({
    to: jest.fn(() => ({ emit })),
}) as unknown as ChatServer;

describe('Socket authentication', () => {
    beforeAll(() => {
        process.env.JWT_SECRET = JWT_SECRET;
    });

    afterAll(() => {
        delete process.env.JWT_SECRET;
    });

    it('extracts the token from handshake.auth.token', () => {
        const token = jwt.sign({ userId: validUserId }, JWT_SECRET);
        const socket = createFakeSocket('', { token }) as unknown as ChatSocket;

        expect(getSocketToken(socket)).toBe(token);
    });

    it('extracts the token from the jwt cookie', () => {
        const token = jwt.sign({ userId: validUserId }, JWT_SECRET);
        const socket = createFakeSocket('', { cookie: `jwt=${token}` }) as unknown as ChatSocket;

        expect(getSocketToken(socket)).toBe(token);
    });

    it('returns null when no token is provided', () => {
        const socket = createFakeSocket('') as unknown as ChatSocket;

        expect(getSocketToken(socket)).toBeNull();
    });

    it.each([
        { cookie: 'foo=bar' },
        { cookie: 'jwt' },
        { cookie: 'session=abc; jwt' },
    ])('returns null when the cookie header has no jwt token value ($cookie)', ({ cookie }) => {
        const socket = createFakeSocket('', { cookie }) as unknown as ChatSocket;

        expect(getSocketToken(socket)).toBeNull();
    });

    it('rejects connections without a token', () => {
        const socket = createFakeSocket('') as unknown as ChatSocket;
        const next = jest.fn();

        authenticateSocket(socket, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect((next.mock.calls[0]![0] as Error).message).toBe('not authenticated');
    });

    it('rejects connections with an invalid token', () => {
        const socket = createFakeSocket('', { token: 'not-a-jwt' }) as unknown as ChatSocket;
        const next = jest.fn();

        authenticateSocket(socket, next);

        expect((next.mock.calls[0]![0] as Error).message).toBe('invalid token');
    });

    it('rejects tokens without a valid ObjectId userId', () => {
        const token = jwt.sign({ userId: 'not-an-id' }, JWT_SECRET);
        const socket = createFakeSocket('', { token }) as unknown as ChatSocket;
        const next = jest.fn();

        authenticateSocket(socket, next);

        expect((next.mock.calls[0]![0] as Error).message).toBe('invalid token');
    });

    it('accepts a valid token and stores userId on socket.data', () => {
        const token = jwt.sign({ userId: validUserId }, JWT_SECRET);
        const socket = createFakeSocket('', { token }) as unknown as ChatSocket;
        const next = jest.fn();

        authenticateSocket(socket, next);

        expect(next).toHaveBeenCalledWith();
        expect(socket.data.userId).toBe(validUserId);
    });

    it('rejects connections when JWT_SECRET is not configured', () => {
        const savedSecret = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;

        try {
            const socket = createFakeSocket('', { token: 'any-token' }) as unknown as ChatSocket;
            const next = jest.fn();

            authenticateSocket(socket, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect((next.mock.calls[0]![0] as Error).message).toBe('invalid token');
        } finally {
            process.env.JWT_SECRET = savedSecret;
        }
    });
});

describe('Socket message handling', () => {
    beforeAll(async () => {
        process.env.JWT_SECRET = JWT_SECRET;
        await mongoose.connect(process.env.MONGO_URL || '');
    }, 30000);

    afterAll(async () => {
        await mongoose.connection.close();
        delete process.env.JWT_SECRET;
    });

    afterEach(async () => {
        if (!mongoose.connection.collections) return;

        const collections = mongoose.connection.collections;
        for (const key in collections) {
            await collections[key]!.deleteMany({});
        }
    });

    it('derives sender from socket.data.userId and ignores a supplied sender', async () => {
        const sender = await UserModel.create({ email: 'socket-sender@test.com', password: 'hash' });
        const recipient = await UserModel.create({ email: 'socket-recipient@test.com', password: 'hash' });

        const socket = createFakeSocket(sender._id.toString()) as unknown as ChatSocket;
        const emit = jest.fn();
        const io = createFakeIo(emit);
        const ack = jest.fn();

        await handleSendMessage(socket, io, {
            sender: recipient._id.toString(), // spoofed sender must be ignored
            recipient: recipient._id.toString(),
            content: 'hello',
            messageType: 'text',
        }, ack);

        const saved = await MessageModel.findOne({ content: 'hello' });
        expect(saved).not.toBeNull();
        expect(saved!.sender.toString()).toBe(sender._id.toString());

        expect(io.to).toHaveBeenCalledWith(sender._id.toString());
        expect(io.to).toHaveBeenCalledWith(recipient._id.toString());
        expect(emit).toHaveBeenCalledTimes(2);

        const firstEmit = emit.mock.calls[0]!;
        expect(firstEmit[0]).toBe('receiveMessage');
        const message = firstEmit[1] as {
            sender: { id: { toString(): string } };
            recipient: { id: { toString(): string } };
        };
        expect(message.sender.id.toString()).toBe(sender._id.toString());
        expect(message.recipient.id.toString()).toBe(recipient._id.toString());
        expect(ack).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(Object) }));
    });

    it.each([
        [{ recipient: 'not-an-id', content: 'hi', messageType: 'text' }, 'Invalid recipient'],
        [{ recipient: validUserId, content: 'hi', messageType: 'text' }, 'Recipient cannot be yourself'],
        [{ recipient: otherUserId, content: 'hi', messageType: 'audio' }, 'Invalid message type'],
        [{ recipient: otherUserId, content: '   ', messageType: 'text' }, 'Content is required'],
        [{ recipient: otherUserId, content: 'x'.repeat(10001), messageType: 'text' }, 'Content is too long'],
    ] as [SendMessagePayload, string][])(
        'rejects invalid payload (%s) without persisting',
        async (payload, expectedError) => {
            const socket = createFakeSocket(validUserId) as unknown as ChatSocket;
            const emit = socket.emit as jest.Mock;
            const io = createFakeIo();
            const ack = jest.fn();

            await handleSendMessage(socket, io, payload, ack);

            expect(emit).toHaveBeenCalledWith('messageError', { error: expectedError });
            expect(ack).toHaveBeenCalledWith({ error: expectedError });
            expect(await MessageModel.countDocuments()).toBe(0);
        },
    );

    it('emits messageError when persistence fails', async () => {
        const socket = createFakeSocket(validUserId) as unknown as ChatSocket;
        const emit = socket.emit as jest.Mock;
        const io = createFakeIo();
        const ack = jest.fn();

        jest.spyOn(MessageModel, 'create').mockRejectedValueOnce(new Error('db down'));
        await handleSendMessage(socket, io, {
            recipient: otherUserId,
            content: 'hi',
            messageType: 'text',
        }, ack);
        jest.restoreAllMocks();

        expect(emit).toHaveBeenCalledWith('messageError', { error: 'Failed to send message' });
        expect(ack).toHaveBeenCalledWith({ error: 'Failed to send message' });
    });

    it('emits messageError without an ack when the payload is invalid', async () => {
        const socket = createFakeSocket(validUserId) as unknown as ChatSocket;
        const emit = socket.emit as jest.Mock;

        await handleSendMessage(socket, createFakeIo(), {
            recipient: 'not-an-id',
            content: 'hi',
            messageType: 'text',
        });

        expect(emit).toHaveBeenCalledWith('messageError', { error: 'Invalid recipient' });
        expect(await MessageModel.countDocuments()).toBe(0);
    });

    it('emits a formatted message without an ack and tolerates a populated sender without _id', async () => {
        const socket = createFakeSocket(validUserId) as unknown as ChatSocket;
        const emit = jest.fn();
        const io = createFakeIo(emit);
        const messageId = new mongoose.Types.ObjectId();

        jest.spyOn(MessageModel, 'create').mockResolvedValueOnce({ _id: messageId } as never);
        const fakeDoc = {
            toObject: () => ({
                _id: messageId,
                messagetype: 'text',
                content: 'hi',
                timestamp: new Date(),
                sender: {},
                recipient: { _id: otherUserId, firstName: 'Recipient' },
            }),
        };
        jest.spyOn(MessageModel, 'findById').mockReturnValueOnce({
            populate: jest.fn(() => ({
                populate: jest.fn(() => Promise.resolve(fakeDoc)),
            })),
        } as never);

        await handleSendMessage(socket, io, {
            recipient: otherUserId,
            content: 'hi',
            messageType: 'text',
        });

        expect(io.to).toHaveBeenCalledWith(validUserId);
        expect(io.to).toHaveBeenCalledWith(otherUserId);
        const receiveCall = emit.mock.calls.find((call) => call[0] === 'receiveMessage');
        expect(receiveCall).toBeDefined();
        const message = receiveCall![1] as {
            sender: { id: unknown };
            recipient: { id: unknown };
        };
        expect(message.sender.id).toBeNull();
        expect(message.recipient.id).toBe(otherUserId);
        jest.restoreAllMocks();
    });

    it('emits messageError without an ack when persistence fails', async () => {
        const socket = createFakeSocket(validUserId) as unknown as ChatSocket;
        const emit = socket.emit as jest.Mock;

        jest.spyOn(MessageModel, 'create').mockRejectedValueOnce(new Error('db down'));
        await handleSendMessage(socket, createFakeIo(), {
            recipient: otherUserId,
            content: 'hi',
            messageType: 'text',
        });
        jest.restoreAllMocks();

        expect(emit).toHaveBeenCalledWith('messageError', { error: 'Failed to send message' });
    });
});

describe('Socket wiring', () => {
    it('joins each socket to its user room and wires the sendMessage handler', async () => {
        let connectionHandler: ((socket: unknown) => void) | undefined;
        const ioEmit = jest.fn();
        const to = jest.fn(() => ({ emit: ioEmit }));
        const io = {
            on: jest.fn((event: string, cb: (socket: unknown) => void) => {
                if (event === 'connection') connectionHandler = cb;
            }),
            to,
        } as unknown as ChatServer;

        const socket = createFakeSocket(validUserId);
        const joinSpy = socket.join as jest.Mock;
        const onSpy = socket.on as jest.Mock;

        registerSocketHandlers(io);

        expect(connectionHandler).toBeDefined();
        connectionHandler?.(socket as unknown as ChatSocket);

        expect(joinSpy).toHaveBeenCalledWith(validUserId);
        expect(onSpy).toHaveBeenCalledWith('sendMessage', expect.any(Function));

        const sendMessageHandler = onSpy.mock.calls.find((call) => call[0] === 'sendMessage')![1] as (
            payload: SendMessagePayload,
            ack?: (response: SendMessageAck) => void,
        ) => void;

        const messageId = new mongoose.Types.ObjectId();
        jest.spyOn(MessageModel, 'create').mockResolvedValueOnce({ _id: messageId } as never);
        const fakeDoc = {
            toObject: () => ({
                _id: messageId,
                messagetype: 'text',
                content: 'wired',
                timestamp: new Date(),
                sender: { _id: validUserId, firstName: 'Sender' },
                recipient: { _id: otherUserId, firstName: 'Recipient' },
            }),
        };
        jest.spyOn(MessageModel, 'findById').mockReturnValueOnce({
            populate: jest.fn(() => ({
                populate: jest.fn(() => Promise.resolve(fakeDoc)),
            })),
        } as never);

        const ack = jest.fn();
        sendMessageHandler({ recipient: otherUserId, content: 'wired', messageType: 'text' }, ack);
        await new Promise<void>((resolve) => setImmediate(resolve));
        jest.restoreAllMocks();

        expect(to).toHaveBeenCalledWith(validUserId);
        expect(to).toHaveBeenCalledWith(otherUserId);
        expect(ioEmit).toHaveBeenCalledWith('receiveMessage', expect.any(Object));
        expect(ack).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(Object) }));
    });

    it('creates a socket.io server without listening', () => {
        const httpServer: HttpServer = createServer();
        const io = createSocketServer(httpServer);

        expect(io).toBeInstanceOf(Server);
        io.close(() => {});
    });
});
