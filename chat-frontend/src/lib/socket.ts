import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import type { SendMessageAck, SendMessagePayload, SocketMessage } from '../types';

export interface ClientToServerEvents {
  sendMessage: (payload: SendMessagePayload, ack?: (response: SendMessageAck) => void) => void;
}

export interface ServerToClientEvents {
  receiveMessage: (message: SocketMessage) => void;
  messageError: (payload: { error: string }) => void;
}

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SEND_TIMEOUT_MS = 10_000;

/**
 * Browser cookie authenticates the handshake; no token is ever passed from JS.
 * Polling is kept as a fallback transport so the cookie is available during
 * the initial handshake in every environment.
 */
export function createChatSocket(): ChatSocket {
  return io(API_BASE_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
  }) as ChatSocket;
}

/**
 * Emit with a client-side timeout so an ack that never arrives (dropped
 * connection) resolves as an error instead of hanging the composer forever.
 */
export function emitSendMessage(
  socket: ChatSocket,
  payload: SendMessagePayload,
  callback: (err: Error | null, ack?: SendMessageAck) => void,
): void {
  const timeoutSocket = socket.timeout(SEND_TIMEOUT_MS);
  const emitWithTimeout = timeoutSocket.emit.bind(timeoutSocket) as unknown as (
    event: 'sendMessage',
    payload: SendMessagePayload,
    callback: (err: Error | null, ack?: SendMessageAck) => void,
  ) => void;
  emitWithTimeout('sendMessage', payload, callback);
}
