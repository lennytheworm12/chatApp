import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { MessageModel } from "../models/message.model.js";
import { isValidObjectId } from "../utils/validation.js";

export const deleteDirectMessages = async (req: Request, res: Response) => {
    try {
        if (!req.userId || !isValidObjectId(req.userId)) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const dmId = req.params.dmId;

        if (!dmId || !isValidObjectId(dmId)) {
            return res.status(400).json({ message: 'Missing or invalid dmId' });
        }

        const userId = new Types.ObjectId(req.userId);
        const contactId = new Types.ObjectId(dmId);

        // Delete all messages between these two users
        await MessageModel.deleteMany({
            $or: [
                { sender: userId, recipient: contactId },
                { sender: contactId, recipient: userId }
            ]
        });

        return res.status(200).json({ message: 'DM deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to delete messages' });
    }
};
