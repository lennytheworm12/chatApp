import { displayName, formatRelativeDay } from '../lib/format';
import type { ContactSummary, RecentContact } from '../types';
import { Avatar } from './Avatar';

interface ContactListProps {
  contacts: RecentContact[] | null;
  error: string | null;
  onRetry: () => void;
  activeContactId: string | null;
  onOpenContact: (contact: ContactSummary) => void;
}

export function ContactList({
  contacts,
  error,
  onRetry,
  activeContactId,
  onOpenContact,
}: ContactListProps) {
  const open = (contact: RecentContact) => {
    onOpenContact({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      color: contact.color,
    });
  };

  return (
    <section className="contacts-pane" aria-label="Recent conversations">
      <h2 className="section-caption">Recent</h2>

      {error && (
        <div className="notice notice--error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn--link" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {!error && contacts === null && <p className="state-note">Loading conversations…</p>}

      {!error && contacts !== null && contacts.length === 0 && (
        <p className="state-note">No conversations yet. Search for someone to start a DM.</p>
      )}

      {!error &&
        contacts !== null &&
        contacts.map((contact) => (
          <button
            key={contact.id}
            type="button"
            className="row-button"
            aria-current={contact.id === activeContactId ? 'true' : undefined}
            onClick={() => open(contact)}
          >
            <Avatar person={contact} size="md" />
            <span className="row-main">
              <span className="row-title">{displayName(contact)}</span>
              {contact.firstName || contact.lastName ? (
                <span className="row-sub">{contact.email}</span>
              ) : null}
            </span>
            <time className="row-time" dateTime={contact.lastMessageTime}>
              {formatRelativeDay(contact.lastMessageTime)}
            </time>
          </button>
        ))}
    </section>
  );
}
