import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getCorsOptions } from '../config.js';
import { MessageModel } from '../models/message.model.js';
import { UserModel } from '../models/user.model.js';
import { isValidObjectId } from '../utils/validation.js';

const JWT_COOKIE_NAME = 'jwt';
const MAX_CONTENT_LENGTH = 10_000;

export interface SendMessagePayload {
    sender?: unknown;
    recipient?: unknown;
    content?: unknown;
    messageType?: unknown;
}

export interface UserRef {
    id: unknown;
    _id?: unknown;
    firstName?: string | undefined;
    lastName?: string | undefined;
    email?: string | undefined;
    color?: string | undefined;
}

export interface FormattedMessage {
    id: unknown;
    messageType: 'text' | 'file';
    content: string;
    timestamp: Date;
    sender: UserRef;
    recipient: UserRef;
}

export type SendMessageAck = { error: string } | { message: FormattedMessage };

export interface ClientToServerEvents {
    sendMessage: (payload: SendMessagePayload, ack?: (response: SendMessageAck) => void) => void;
}

export interface ServerToClientEvents {
    receiveMessage: (message: FormattedMessage) => void;
    messageError: (payload: { error: string }) => void;
}

export interface InterServerEvents {}

export interface SocketData {
    userId: string;
}

export type ChatServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

interface SendMessageInput {
    recipient: string;
    content: string;
    messageType: 'text' | 'file';
}

const getTokenFromCookieHeader = (cookieHeader: string | undefined): string | null => {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === JWT_COOKIE_NAME && rest.length > 0) {
            return rest.join('=');
        }
    }
    return null;
};

export const getSocketToken = (socket: ChatSocket): string | null => {
    return getTokenFromCookieHeader(socket.handshake.headers.cookie);
};

export const authenticateSocket = (socket: ChatSocket, next: (err?: Error) => void): void => {
    try {
        const token = getSocketToken(socket);
        if (!token) {
            next(new Error('not authenticated'));
            return;
        }
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            next(new Error('invalid token'));
            return;
        }
        const decoded = jwt.verify(token, secret) as { userId?: unknown };
        if (typeof decoded.userId !== 'string' || !isValidObjectId(decoded.userId)) {
            next(new Error('invalid token'));
            return;
        }
        socket.data.userId = decoded.userId;
        next();
    } catch {
        next(new Error('invalid token'));
    }
};

const parseSendMessage = (
    payload: SendMessagePayload,
    senderId: string,
): { ok: true; value: SendMessageInput } | { ok: false; error: string } => {
    if (typeof payload.recipient !== 'string' || !isValidObjectId(payload.recipient)) {
        return { ok: false, error: 'Invalid recipient' };
    }
    if (payload.recipient === senderId) {
        return { ok: false, error: 'Recipient cannot be yourself' };
    }
    if (payload.messageType !== 'text' && payload.messageType !== 'file') {
        return { ok: false, error: 'Invalid message type' };
    }
    if (typeof payload.content !== 'string' || payload.content.trim().length === 0) {
        return { ok: false, error: 'Content is required' };
    }
    if (payload.content.length > MAX_CONTENT_LENGTH) {
        return { ok: false, error: 'Content is too long' };
    }
    return {
        ok: true,
        value: {
            recipient: payload.recipient,
            content: payload.content,
            messageType: payload.messageType,
        },
    };
};

const formatUserRef = (value: unknown): UserRef => {
    const user = value as { _id?: unknown; firstName?: string; lastName?: string; email?: string; color?: string };
    return {
        id: user._id ?? null,
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        color: user.color,
    };
};

export const handleSendMessage = async (
    socket: ChatSocket,
    io: ChatServer,
    payload: SendMessagePayload,
    ack?: (response: SendMessageAck) => void,
): Promise<void> => {
    const senderId = socket.data.userId;
    const parsed = parseSendMessage(payload, senderId);
    if (!parsed.ok) {
        socket.emit('messageError', { error: parsed.error });
        if (ack) ack({ error: parsed.error });
        return;
    }

    try {
        const recipientExists = await UserModel.exists({ _id: parsed.value.recipient });
        if (!recipientExists) {
            const error = 'Recipient does not exist';
            socket.emit('messageError', { error });
            if (ack) ack({ error });
            return;
        }

        const newMessage = await MessageModel.create({
            sender: senderId,
            recipient: parsed.value.recipient,
            content: parsed.value.content,
            messagetype: parsed.value.messageType,
        });

        const populatedMessage = await MessageModel
            .findById(newMessage._id)
            .populate('sender', 'firstName lastName email color')
            .populate('recipient', 'firstName lastName email color');

        if (!populatedMessage) {
            throw new Error('Message not found after creation');
        }

        const obj = populatedMessage.toObject();
        const formatted: FormattedMessage = {
            id: obj._id,
            messageType: obj.messagetype,
            content: obj.content,
            timestamp: obj.timestamp,
            sender: formatUserRef(obj.sender),
            recipient: formatUserRef(obj.recipient),
        };

        io.to(senderId).emit('receiveMessage', formatted);
        io.to(parsed.value.recipient).emit('receiveMessage', formatted);
        if (ack) ack({ message: formatted });
    } catch {
        socket.emit('messageError', { error: 'Failed to send message' });
        if (ack) ack({ error: 'Failed to send message' });
    }
};

const onConnection = (io: ChatServer, socket: ChatSocket): void => {
    // Socket.IO rooms keyed by verified user id: every live socket for a user
    // joins the same room, so multiple tabs all receive messages and a single
    // disconnect does not unregister the others.
    socket.join(socket.data.userId);

    socket.on('sendMessage', (payload, ack) => {
        void handleSendMessage(socket, io, payload, ack);
    });
};

export const registerSocketHandlers = (io: ChatServer): void => {
    io.on('connection', (socket) => onConnection(io, socket));
};

export const createSocketServer = (httpServer: HttpServer): ChatServer => {
    const io: ChatServer = new Server(httpServer, {
        cors: getCorsOptions(),
    });

    io.use(authenticateSocket);
    registerSocketHandlers(io);
    return io;
};
