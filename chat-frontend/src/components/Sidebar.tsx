import type { ContactSummary, RecentContact } from '../types';
import { ContactList } from './ContactList';
import { UserSearch } from './UserSearch';

interface SidebarProps {
  currentUserId: string;
  contacts: RecentContact[] | null;
  contactsError: string | null;
  onRetryContacts: () => void;
  activeContactId: string | null;
  onOpenContact: (contact: ContactSummary) => void;
}

export function Sidebar({
  currentUserId,
  contacts,
  contactsError,
  onRetryContacts,
  activeContactId,
  onOpenContact,
}: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Conversations and search">
      <UserSearch currentUserId={currentUserId} onOpenContact={onOpenContact} />
      <ContactList
        contacts={contacts}
        error={contactsError}
        onRetry={onRetryContacts}
        activeContactId={activeContactId}
        onOpenContact={onOpenContact}
      />
    </aside>
  );
}
