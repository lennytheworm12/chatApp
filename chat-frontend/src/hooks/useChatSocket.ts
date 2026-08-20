import { useCallback, useEffect, useRef, useState } from 'react';
import { createChatSocket, emitSendMessage, type ChatSocket } from '../lib/socket';
import type { SendMessageAck, SendMessagePayload, SocketMessage } from '../types';

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface UseChatSocketOptions {
  enabled: boolean;
  onMessage: (message: SocketMessage) => void;
  onMessageError: (error: string) => void;
}

/**
 * Owns one Socket.IO connection. Listens are registered exactly once per
 * connection and fully torn down on unmount, so StrictMode double-mounts
 * never leave duplicate listeners behind.
 */
export function useChatSocket({ enabled, onMessage, onMessageError }: UseChatSocketOptions) {
  const [status, setStatus] = useState<SocketStatus>(enabled ? 'connecting' : 'disconnected');
  const socketRef = useRef<ChatSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const onMessageErrorRef = useRef(onMessageError);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onMessageErrorRef.current = onMessageError;
  }, [onMessage, onMessageError]);

  useEffect(() => {
    if (!enabled) return;

    const socket = createChatSocket();
    socketRef.current = socket;

    const handleConnect = () => setStatus('connected');
    const handleDisconnect = (reason: string) => {
      setStatus(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting');
    };
    const handleConnectError = () => setStatus('reconnecting');
    const handleReceive = (message: SocketMessage) => onMessageRef.current(message);
    const handleMessageError = (payload: { error: string }) =>
      onMessageErrorRef.current(payload.error);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('receiveMessage', handleReceive);
    socket.on('messageError', handleMessageError);

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setStatus('disconnected');
    };
  }, [enabled]);

  const sendMessage = useCallback(
    (payload: SendMessagePayload, callback: (err: Error | null, ack?: SendMessageAck) => void) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        callback(new Error('Socket not connected'));
        return;
      }
      emitSendMessage(socket, payload, callback);
    },
    [],
  );

  return { status, sendMessage };
}
