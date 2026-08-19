import type { HistoryMessage, NormalizedMessage, SocketMessage } from '../types';

export function normalizeHistoryMessage(message: HistoryMessage): NormalizedMessage {
  return {
    id: String(message.id),
    messageType: message.messageType,
    content: message.content,
    timestamp: message.timestamp,
    senderId: String(message.sender),
    recipientId: String(message.recipient),
  };
}

export function normalizeSocketMessage(message: SocketMessage): NormalizedMessage {
  return {
    id: String(message.id),
    messageType: message.messageType,
    content: message.content,
    timestamp: message.timestamp,
    senderId: String(message.sender.id ?? message.sender._id ?? ''),
    recipientId: String(message.recipient.id ?? message.recipient._id ?? ''),
  };
}

/** Insert a message into a chronological list, deduplicated by server id. */
export function mergeMessage(
  list: NormalizedMessage[],
  next: NormalizedMessage,
): NormalizedMessage[] {
  if (list.some((message) => message.id === next.id)) return list;
  return [...list, next].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA !== timeB ? timeA - timeB : a.id.localeCompare(b.id);
  });
}
