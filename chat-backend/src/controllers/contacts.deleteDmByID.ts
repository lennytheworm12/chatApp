
import type { Request, Response } from 'express';
import { MessageModel } from "../models/message.model.js";
import { UserModel } from "../models/user.model.js";


export const deleteDirectMessages = async (req: Request, res: Response) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const dmId = req.params.dmId;

        if (!dmId || dmId === 'undefined') {
            return res.status(400).json({ message: 'Missing or invalid dmId' });
        }

        // Delete all messages between these two users
        await MessageModel.deleteMany({
            $or: [
                { sender: req.userId, recipient: dmId },
                { sender: dmId, recipient: req.userId }
            ]
        } as any);

        return res.status(200).json({ message: 'DM deleted successfully' });

    } catch (error) {
        console.error('Delete DM error:', error);
        return res.status(500).json({ message: 'Failed to delete messages' });
    }
};
