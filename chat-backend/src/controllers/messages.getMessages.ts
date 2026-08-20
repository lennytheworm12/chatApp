// controllers/messages.getMessages.ts
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { MessageModel } from "../models/message.model.js";
import type { GetMessagesData } from "../types/auth.types.js";
import { isValidObjectId } from "../utils/validation.js";

export const getMessages = async (
    req: Request<{}, {}, GetMessagesData>,
    res: Response
) => {
    try {
        if (!req.userId || !isValidObjectId(req.userId)) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const contactorId = req.body.id;

        if (typeof contactorId !== 'string' || !isValidObjectId(contactorId)) {
            return res.status(400).json({ message: 'Contactor ID is required' });
        }

        const userId = new Types.ObjectId(req.userId);
        const contactId = new Types.ObjectId(contactorId);

        const messages = await MessageModel.find({
            $or: [
                { sender: userId, recipient: contactId },
                { sender: contactId, recipient: userId }
            ]
        }).sort({ timestamp: 1 }); // Oldest first

        const formatted = messages.map(m => {
            const { _id, messagetype, ...rest } = m.toObject();
            return { id: _id, messageType: messagetype, ...rest };
        });
        return res.status(200).json({ messages: formatted });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to retrieve messages' });
    }
};
