import type { SocketStatus } from '../hooks/useChatSocket';
import { displayName } from '../lib/format';
import type { ContactSummary, NormalizedMessage } from '../types';
import { Avatar } from './Avatar';
import { MessageComposer } from './MessageComposer';
import { MessageList } from './MessageList';

interface ConversationProps {
  contact: ContactSummary | null;
  currentUserId: string;
  messages: NormalizedMessage[];
  historyLoading: boolean;
  historyError: string | null;
  onRetryHistory: () => void;
  socketStatus: SocketStatus;
  sendPending: boolean;
  sendError: string | null;
  onSend: (content: string) => Promise<boolean>;
  onBack: () => void;
}

export function Conversation({
  contact,
  currentUserId,
  messages,
  historyLoading,
  historyError,
  onRetryHistory,
  socketStatus,
  sendPending,
  sendError,
  onSend,
  onBack,
}: ConversationProps) {
  if (!contact) {
    return (
      <section className="conversation">
        <div className="conversation-empty">
          <div>
            <p className="conversation-empty-title">Select a conversation.</p>
            <p className="state-note">Search for someone, or pick a recent thread from the list.</p>
          </div>
        </div>
      </section>
    );
  }

  const connected = socketStatus === 'connected';

  return (
    <section className="conversation" aria-label={`Conversation with ${displayName(contact)}`}>
      <header className="conversation-header">
        <button type="button" className="btn btn--ghost back-button" onClick={onBack}>
          Back
        </button>
        <Avatar person={contact} size="sm" />
        <div className="conversation-heading">
          <h1 className="conversation-title">{displayName(contact)}</h1>
          <p className="conversation-sub">
            {contact.email || 'Direct message'}
            {!connected ? ' · reconnecting…' : ''}
          </p>
        </div>
      </header>

      <MessageList
        messages={messages}
        currentUserId={currentUserId}
        loading={historyLoading}
        error={historyError}
        onRetry={onRetryHistory}
      />

      {sendError && (
        <div className="notice notice--error composer-notice" role="alert">
          {sendError}
        </div>
      )}

      <MessageComposer disabled={!connected} pending={sendPending} onSend={onSend} />
    </section>
  );
}
