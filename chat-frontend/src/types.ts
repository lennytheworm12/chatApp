export interface User {
  id: string;
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  image?: string;
  color?: string;
  profileSetup: boolean;
}

/** Minimal identity fields used anywhere a person is displayed. */
export interface ContactSummary {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  color?: string;
}

/** Conversation row returned by GET /api/contacts/get-contacts-for-list. */
export interface RecentContact extends ContactSummary {
  lastMessageTime: string;
}

/** Message as stored in history (sender/recipient are plain ids). */
export interface HistoryMessage {
  id: string;
  messageType: 'text' | 'file';
  content: string;
  timestamp: string;
  sender: string;
  recipient: string;
}

/** Canonical client-side message shape shared by history and socket events. */
export interface NormalizedMessage {
  id: string;
  messageType: 'text' | 'file';
  content: string;
  timestamp: string;
  senderId: string;
  recipientId: string;
}

/** Populated user reference used in socket message events. */
export interface SocketUserRef {
  id?: string | null;
  _id?: string | null;
  firstName?: string;
  lastName?: string;
  email?: string;
  color?: string;
}

/** Message delivered over Socket.IO (populated sender/recipient). */
export interface SocketMessage {
  id: string;
  messageType: 'text' | 'file';
  content: string;
  timestamp: string;
  sender: SocketUserRef;
  recipient: SocketUserRef;
}

export interface SendMessagePayload {
  recipient: string;
  content: string;
  messageType: 'text';
}

export type SendMessageAck = { error: string } | { message: SocketMessage };
