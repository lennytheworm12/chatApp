import { createContext, useContext } from 'react';
import type { User } from '../types';

export type AuthStatus = 'bootstrapping' | 'signedOut' | 'signedIn';

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (profile: { firstName: string; lastName: string; color?: string }) => Promise<void>;
  retryBootstrap: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
