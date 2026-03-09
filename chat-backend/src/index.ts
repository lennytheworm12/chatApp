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
import {Server} from 'socket.io';
import {createServer} from 'http';
import { MessageModel } from './models/message.model.js';
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
mongoose.connect(mongoURL).then(()=> console.log("mongodb connected")).catch(err =>console.error("mongodb connection failed: ", err));

//middleware
//parse as json, parse cookies, and use cors
app.use(express.json());
app.use(cookieParser());
app.use(cors({origin: process.env.CLIENT_ORIGIN, credentials:true}));
//if a message comes in with auth route it to the authrouter
app.use('/api/auth', authRouter);
app.use('/api/contacts', contactRouter);
app.use('/api/messages', messageRouter);

app.get('/health', (_req:Request, res:Response) => {
    res.json({status:'ok'});
});
const userSocketMap = new Map<string, string>();

io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId as string;
  
  if (userId) {
    userSocketMap.set(userId, socket.id);
  }

  socket.on('sendMessage', async (data) => {
    // Your socket logic here
  });

  socket.on('disconnect', () => {
    if (userId) {
      userSocketMap.delete(userId);
    }
  });
});

// IMPORTANT: Use server.listen, NOT app.listen
server.listen(port, () => console.log(`running on ${port}`));


