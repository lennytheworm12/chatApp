//this file index.ts its job is to setup our backend server and route things

import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import authRouter from './routes/auth.routes.js';
import contactRouter from './routes/contact.routes.js';
import messageRouter from './routes/messages.routes.js';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { MessageModel } from './models/message.model.js';
import channelRouter from "./routes/channel.routes.js";
dotenv.config();

const app = express();
const port = process.env.PORT ?? 8747;
const mongoURL = process.env.MONGO_URL ?? "";

const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_ORIGIN,
        credentials: true
    }
});

//connect to the db
mongoose.connect(mongoURL).then(() => console.log("mongodb connected")).catch(err => console.error("mongodb connection failed: ", err));

//middleware
//parse as json, parse cookies, and use cors
app.use(express.json());
app.use((req, _res, next) => {
    console.log(`→ ${req.method} ${req.path}`);
    next();
});
app.use(cookieParser());
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
//if a message comes in with auth route it to the authrouter
app.use('/api/auth', authRouter);
app.use('/api/contacts', contactRouter);
app.use('/api/messages', messageRouter);
app.use('/api/channel', channelRouter);

app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
});
const userSocketMap = new Map<string, string>();

io.on('connection', (socket) => {
    // Grab the userId from the query string when the client connects
    const userId = socket.handshake.query.userId as string;
    console.log('user connected, userId:', userId);

    if (userId) {
        userSocketMap.set(userId, socket.id);
    }
    console.log('userSocketMap:', [...userSocketMap.entries()]);
    socket.on('sendMessage', async (messageData) => {
        console.log('data received:', messageData);
        try {
            const { sender, recipient, content, messageType } = messageData;

            const newMessage = await MessageModel.create({
                sender,
                recipient,
                content,
                messagetype: messageType,
            });

            const populatedMessage = await MessageModel
                .findById(newMessage._id)
                .populate('sender', 'firstName lastName email color')
                .populate('recipient', 'firstName lastName email color');

            const obj = populatedMessage!.toObject();
            const formatted = {
                id: obj._id,
                messageType: obj.messagetype,
                content: obj.content,
                timestamp: obj.timestamp,
                sender: { ...obj.sender, id: obj.sender._id },
                recipient: { ...obj.recipient, id: obj.recipient._id },
            };

            const recipientSocketId = userSocketMap.get(recipient.toString());
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('receiveMessage', formatted);
            }

            const senderSocketId = userSocketMap.get(sender.toString());
            if (senderSocketId) {
                io.to(senderSocketId).emit('receiveMessage', formatted);
            }

        } catch (error) {
            console.error("Error saving/sending message:", error);
            socket.emit('messageError', { error: 'Failed to send message' });
        }
    });

    socket.on('disconnect', () => {
        if (userId) {
            userSocketMap.delete(userId);
        }
    });
});

// IMPORTANT: Use server.listen, NOT app.listen
server.listen(port, () => console.log(`running on ${port}`));


