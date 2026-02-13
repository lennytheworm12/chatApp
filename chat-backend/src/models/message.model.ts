//this file will hold the schema and model for messages 
//

import { Schema, Types } from 'mongoose';
import { model } from 'mongoose';

interface MessageInterface {
    sender: Types.ObjectId,
    recipient: Types.ObjectId;
    content: string;
    messagetype: 'text' | 'file';
    timestamp: Date;
}



const messageSchema = new Schema<MessageInterface>({

    sender: { type: Types.ObjectId },
    recipient: { type: Types.ObjectId },
    content: { type: String },
    messagetype: { type: String, enum: ['text', 'file'] },
    timestamp: { type: Date },
});

export const MessageModel = model<MessageInterface>('User', messageSchema);
