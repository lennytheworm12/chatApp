import { useState } from 'react';
import type { SocketStatus } from '../hooks/useChatSocket';
import type { User } from '../types';
import { displayName } from '../lib/format';
import { Avatar } from './Avatar';

interface HeaderProps {
  user: User;
  socketStatus: SocketStatus;
  onLogout: () => Promise<void>;
}

const SOCKET_LABELS: Record<SocketStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  disconnected: 'Offline',
};

export function Header({ user, socketStatus, onLogout }: HeaderProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await onLogout();
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : 'Logout failed. Please try again.',
      );
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="app-header" style={{ position: 'relative' }}>
      <div className="brand">
        Portfolio DM<span className="brand-dot">.</span>
      </div>

      <div className="header-right">
        <span className={`socket-chip socket-chip--${socketStatus}`} aria-live="polite">
          {SOCKET_LABELS[socketStatus]}
        </span>

        <div className="user-chip">
          <Avatar person={user} size="sm" />
          <span className="user-chip-meta">
            <span className="user-chip-name">{displayName(user)}</span>
            <span className="user-chip-email">{user.email}</span>
          </span>
        </div>

        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
        >
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </div>

      {logoutError && (
        <div
          className="notice notice--error"
          role="alert"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            margin: 0,
            zIndex: 20,
          }}
        >
          {logoutError}
        </div>
      )}
    </header>
  );
}
