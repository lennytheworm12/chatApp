import { useEffect, useMemo, useRef } from 'react';
import { dayGroupLabel, formatMessageTime } from '../lib/format';
import type { NormalizedMessage } from '../types';

interface MessageListProps {
  messages: NormalizedMessage[];
  currentUserId: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

interface MessageGroup {
  key: string;
  label: string;
  items: NormalizedMessage[];
}

export function MessageList({ messages, currentUserId, loading, error, onRetry }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lastMessageId]);

  const groups = useMemo(() => {
    return messages.reduce<MessageGroup[]>((acc, message) => {
      const key = new Date(message.timestamp).toDateString();
      const last = acc[acc.length - 1];
      if (last && last.key === key) {
        last.items.push(message);
      } else {
        acc.push({ key, label: dayGroupLabel(message.timestamp), items: [message] });
      }
      return acc;
    }, []);
  }, [messages]);

  return (
    <div className="message-list" role="log" aria-live="polite" aria-label="Messages">
      {loading && <p className="state-note">Loading messages…</p>}

      {error && (
        <div className="notice notice--error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn--link" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && messages.length === 0 && (
        <p className="state-note state-note--center">No messages yet. Say hello.</p>
      )}

      {groups.map((group) => (
        <div key={group.key} className="message-group">
          <div className="day-separator" role="separator">
            {group.label}
          </div>
          {group.items.map((message) => {
            const own = message.senderId === currentUserId;
            return (
              <div key={message.id} className={`message-row ${own ? 'message-row--own' : 'message-row--other'}`}>
                <div className="message-bubble">
                  {message.content}
                  <div className="message-meta">
                    <time dateTime={message.timestamp}>{formatMessageTime(message.timestamp)}</time>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
