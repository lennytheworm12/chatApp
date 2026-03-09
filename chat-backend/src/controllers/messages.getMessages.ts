// controllers/messages.getMessages.ts
import type { Request, Response } from 'express';
import { MessageModel } from "../models/message.model.js";
import type {GetMessagesData} from "../types/auth.types.js";


export const getMessages = async (
  req: Request<{}, {}, GetMessagesData>, 
  res: Response
) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const contactorId = req.body.id;

    if (!contactorId) {
      return res.status(400).json({ message: 'Contactor ID is required' });
    }

    const messages = await MessageModel.find({
      $or: [
        { sender: req.userId, recipient: contactorId },
        { sender: contactorId, recipient: req.userId }
      ]
    } as any).sort({ timestamp: 1 }); // Oldest first

    return res.status(200).json({ messages });
    
  } catch (error) {
    console.error('Get messages error:', error);
    return res.status(500).json({ message: 'Failed to retrieve messages' });
  }
};
