//production entrypoint: build the app and socket server, connect to Mongo,
//and only then start listening.
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { createApp } from './app.js';
import { createSocketServer } from './socket/index.js';

dotenv.config();

const port = process.env.PORT ?? 8747;
const mongoURL = process.env.MONGO_URL ?? '';

const app = createApp();
const server = createServer(app);
createSocketServer(server);

const start = async () => {
    try {
        await mongoose.connect(mongoURL);
        server.listen(port, () => {
            console.log(`running on ${port}`);
        });
    } catch (error) {
        console.error('Failed to connect to MongoDB', error);
        process.exit(1);
    }
};

void start();
