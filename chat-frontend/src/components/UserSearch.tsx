import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { displayName } from '../lib/format';
import type { ContactSummary, User } from '../types';
import { Avatar } from './Avatar';

interface UserSearchProps {
  currentUserId: string;
  onOpenContact: (contact: ContactSummary) => void;
}

export function UserSearch({ currentUserId, onOpenContact }: UserSearchProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<User[] | null>(null);
  const [resultsTerm, setResultsTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const trimmed = term.trim();
    const sequence = ++sequenceRef.current;
    if (!trimmed) {
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { contacts } = await api.searchContacts(trimmed);
          if (sequence !== sequenceRef.current) return;
          // Backend already excludes self; keep a defensive filter anyway.
          const filtered = contacts.filter((contact) => contact.id !== currentUserId);
          setResults(filtered);
          setResultsTerm(trimmed);
          setError(null);
        } catch (searchError) {
          if (sequence !== sequenceRef.current) return;
          if (searchError instanceof ApiError && searchError.status === 401) return;
          setError(
            searchError instanceof ApiError
              ? searchError.message
              : 'Search failed. Please try again.',
          );
          setResults(null);
          setResultsTerm('');
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [term, currentUserId, attempt]);

  const selectContact = (contact: User) => {
    onOpenContact({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      color: contact.color,
    });
    setTerm('');
    setResults(null);
    setResultsTerm('');
    setError(null);
  };

  const trimmedTerm = term.trim();
  const hasTerm = trimmedTerm.length > 0;
  const showResults = hasTerm && results !== null && resultsTerm === trimmedTerm && !error;
  const searching = hasTerm && !error && !showResults;

  return (
    <section className="search-pane" aria-label="Search people">
      <label className="section-caption" htmlFor="user-search">
        Find someone
      </label>
      <input
        id="user-search"
        className="field-input"
        type="search"
        placeholder="Search by name or email"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        autoComplete="off"
        aria-label="Search people by name or email"
      />

      {searching && <p className="state-note">Searching…</p>}

      {hasTerm && error && (
        <div className="notice notice--error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="btn btn--link"
            onClick={() => {
              setError(null);
              setResults(null);
              setResultsTerm('');
              setAttempt((n) => n + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}

      {showResults && (
        <div className="search-results" role="list" aria-label="Search results">
          {results.length === 0 && (
            <p className="state-note">No people found for “{trimmedTerm}”.</p>
          )}
          {results.map((contact) => (
            <button
              key={contact.id}
              type="button"
              className="row-button"
              role="listitem"
              onClick={() => selectContact(contact)}
            >
              <Avatar person={contact} size="sm" />
              <span className="row-main">
                <span className="row-title">{displayName(contact)}</span>
                {contact.firstName || contact.lastName ? (
                  <span className="row-sub">{contact.email}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
