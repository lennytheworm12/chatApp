import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatSocket } from '../hooks/useChatSocket';
import { ApiError, api } from '../lib/api';
import { mergeMessage, normalizeHistoryMessage, normalizeSocketMessage } from '../lib/messages';
import type {
  ContactSummary,
  NormalizedMessage,
  RecentContact,
  SocketMessage,
  User,
} from '../types';
import { Conversation } from './Conversation';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface ChatAppProps {
  user: User;
  onLogout: () => Promise<void>;
}

export function ChatApp({ user, onLogout }: ChatAppProps) {
  const [contacts, setContacts] = useState<RecentContact[] | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [activeContact, setActiveContact] = useState<ContactSummary | null>(null);
  const [history, setHistory] = useState<Record<string, NormalizedMessage[]>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [sendPending, setSendPending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const loadedConversationsRef = useRef<Set<string>>(new Set());
  const loadingConversationsRef = useRef<Set<string>>(new Set());

  const activeContactId = activeContact?.id ?? null;

  const refreshContacts = useCallback(async () => {
    try {
      const { contacts: list } = await api.getContactsForList();
      setContacts(list);
      setContactsError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      setContactsError(
        error instanceof ApiError ? error.message : 'Unable to load conversations.',
      );
    }
  }, []);

  useEffect(() => {
    void refreshContacts();
  }, [refreshContacts]);

  const handleIncomingMessage = useCallback(
    (message: SocketMessage) => {
      const normalized = normalizeSocketMessage(message);
      const otherId =
        normalized.senderId === user.id ? normalized.recipientId : normalized.senderId;
      if (!otherId) return;
      setHistory((prev) => {
        const current = prev[otherId] ?? [];
        return { ...prev, [otherId]: mergeMessage(current, normalized) };
      });
      void refreshContacts();
    },
    [user.id, refreshContacts],
  );

  const handleSocketMessageError = useCallback((error: string) => {
    setSendError(error);
    setSendPending(false);
  }, []);

  const { status: socketStatus, sendMessage } = useChatSocket({
    enabled: true,
    onMessage: handleIncomingMessage,
    onMessageError: handleSocketMessageError,
  });

  const openConversation = useCallback((contact: ContactSummary) => {
    setActiveContact(contact);
    setSendError(null);
    setSendPending(false);
  }, []);

  const closeConversation = useCallback(() => {
    setActiveContact(null);
    setSendError(null);
    setSendPending(false);
  }, []);

  const retryHistory = useCallback(() => {
    if (!activeContactId) return;
    loadedConversationsRef.current.delete(activeContactId);
    setHistoryRetry((n) => n + 1);
  }, [activeContactId]);

  useEffect(() => {
    if (!activeContactId) return;
    if (loadedConversationsRef.current.has(activeContactId)) return;
    if (loadingConversationsRef.current.has(activeContactId)) return;

    loadingConversationsRef.current.add(activeContactId);
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);

    void (async () => {
      try {
        const { messages } = await api.getMessages(activeContactId);
        if (cancelled) return;
        const fetched = messages.map(normalizeHistoryMessage);
        setHistory((prev) => {
          const existing = prev[activeContactId] ?? [];
          const merged = fetched.reduce((acc, message) => mergeMessage(acc, message), existing);
          return { ...prev, [activeContactId]: merged };
        });
        loadedConversationsRef.current.add(activeContactId);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) return;
        setHistoryError(error instanceof ApiError ? error.message : 'Unable to load messages.');
      } finally {
        loadingConversationsRef.current.delete(activeContactId);
        if (!cancelled) setHistoryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeContactId, historyRetry]);

  const handleSend = useCallback(
    (content: string): Promise<boolean> => {
      if (!activeContactId || sendPending || socketStatus !== 'connected') {
        return Promise.resolve(false);
      }
      const trimmed = content.trim();
      if (!trimmed) return Promise.resolve(false);

      setSendPending(true);
      setSendError(null);

      return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (sent: boolean, error: string | null) => {
          if (settled) return;
          settled = true;
          setSendPending(false);
          if (error) setSendError(error);
          resolve(sent);
        };

        sendMessage(
          { recipient: activeContactId, content: trimmed, messageType: 'text' },
          (err, ack) => {
            if (err) {
              finish(false, 'Not sent — the connection was lost. Your message is still in the box.');
              return;
            }
            if (!ack) {
              finish(false, 'Not sent — the server did not confirm the message.');
              return;
            }
            if ('error' in ack) {
              finish(false, ack.error);
              return;
            }
            const normalized = normalizeSocketMessage(ack.message);
            setHistory((prev) => ({
              ...prev,
              [activeContactId]: mergeMessage(prev[activeContactId] ?? [], normalized),
            }));
            void refreshContacts();
            finish(true, null);
          },
        );
      });
    },
    [activeContactId, sendPending, socketStatus, sendMessage, refreshContacts],
  );

  const activeMessages = activeContactId ? (history[activeContactId] ?? []) : [];

  return (
    <div className="app-shell">
      <Header user={user} socketStatus={socketStatus} onLogout={onLogout} />
      <div className={`workspace${activeContactId ? ' workspace--conversation-open' : ''}`}>
        <Sidebar
          currentUserId={user.id}
          contacts={contacts}
          contactsError={contactsError}
          onRetryContacts={() => void refreshContacts()}
          activeContactId={activeContactId}
          onOpenContact={openConversation}
        />
        <Conversation
          contact={activeContact}
          currentUserId={user.id}
          messages={activeMessages}
          historyLoading={historyLoading}
          historyError={historyError}
          onRetryHistory={retryHistory}
          socketStatus={socketStatus}
          sendPending={sendPending}
          sendError={sendError}
          onSend={handleSend}
          onBack={closeConversation}
        />
      </div>
    </div>
  );
}
