//this file index.ts its job is to setup our backend server and route things

import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import authRouter from './routes/auth.routes.js';
dotenv.config();

const app = express();
const port = process.env.PORT ?? 8747;
const mongoURL = process.env.MONGO_URL ?? "";

//connect to the db
mongoose.connect(mongoURL).then(()=> console.log("mongodb connected")).catch(err =>console.error("mongodb connection failed: ", err));

//middleware
//parse as json, parse cookies, and use cors
app.use(express.json());
app.use(cookieParser());
app.use(cors({origin: process.env.CLIENT_ORIGIN, credentials:true}));
//if a message comes in with auth route it to the authrouter
app.use('/api/auth', authRouter);

app.get('/health', (_req:Request, res:Response) => {
    res.json({status:'ok'});
});


app.listen(port, () => console.log(`running on ${port}`));


