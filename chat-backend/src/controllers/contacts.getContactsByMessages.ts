//go through msg db and get the contact list for a user


import type { Request, Response } from 'express';
import { MessageModel } from "../models/message.model.js";
import { UserModel } from "../models/user.model.js";

import type { MessageInterface } from "../models/message.model.js";
// import type { FilterQuery } from 'mongoose';

export const getContactBySortedMessages = async (req: Request, res: Response) => {
    //given query the message db with user id and return msgs containing req.user
    try {
        if (!req.userId) {
            return res.status(401).json({ message: 'Not authenticated' });
        }
        const messages = await MessageModel.find({
            $or: [
                { sender: req.userId },
                { recipient: req.userId }
            ]
        } as any).sort({ timestamp: -1 });

        const contactMap = new Map<string, Date>();

        for (const msg of messages) {
            // Get the "other person" - if I'm sender, get recipient; else get sender
            const contactId = msg.sender.toString() === req.userId
                ? msg.recipient.toString()
                : msg.sender.toString();

            // Only keep first occurrence (most recent since sorted)
            if (!contactMap.has(contactId)) {
                contactMap.set(contactId, msg.timestamp);
            }
        }


        // Step 2: Get contact IDs in order (already sorted by most recent)
        const contactIds = Array.from(contactMap.keys());

        // Step 3: Fetch user info for these contacts
        const users = await UserModel.find({ _id: { $in: contactIds } });

        // Step 4: Build response - attach lastMessageTime to each user
        const contacts = contactIds.flatMap(id => {
            const user = users.find(u => u._id.toString() === id);
            if (!user) return []; // Skip if user deleted

            return [{
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                image: user.image,
                color: user.color,
                lastMessageTime: contactMap.get(id)
            }];
        });

        return res.status(200).json({ contacts });
    } catch (error) {
        return res.status(500).json({ message: "data base retrevial error" });
    }


}
