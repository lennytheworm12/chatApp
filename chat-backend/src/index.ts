//this file index.ts its job is to setup our backend server and route things

import express from 'express'
import type { Request, Response } from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import mongoose from 'mongoose'

dotenv.config();

const app = express();
const port = process.env.PORT ?? 8747;

//middleware
//parse as json, parse cookies, and use cors
app.use(express.json());
app.use(cookieParser());
app.use(cors({origin: process.env.CLIENT_ORIGIN, credentials:true}))


app.get('/health', (_req:Request, res:Response) => {
    res.json({status:'ok'})
});


app.use(


