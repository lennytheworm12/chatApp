//this file will hold the schema and model for messages 
//

import { Schema, Types } from 'mongoose';
import { model } from 'mongoose';

export interface MessageInterface {
    sender: Types.ObjectId,
    recipient: Types.ObjectId;
    content: string;
    messagetype: 'text' | 'file';
    timestamp: Date;
}



const messageSchema = new Schema<MessageInterface>({
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    messagetype: { type: String, enum: ['text', 'file'], required: true },
    timestamp: { type: Date, default: Date.now, required: true }
});

messageSchema.index({ sender: 1, timestamp: -1 });
messageSchema.index({ recipient: 1, timestamp: -1 });
//for faster querying of messages

export const MessageModel = model<MessageInterface>('Message', messageSchema);
