import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api, setUnauthorizedListener } from '../lib/api';
import { AuthContext, type AuthStatus } from './context';
import type { User } from '../types';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  error: string | null;
}

const INITIAL_STATE: AuthState = { status: 'bootstrapping', user: null, error: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  const fetchSession = useCallback(async (): Promise<User | null> => {
    try {
      const { user } = await api.userinfo();
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  }, []);

  const applySession = useCallback((user: User | null, error: string | null = null) => {
    if (user) {
      setState({ status: 'signedIn', user, error: null });
    } else {
      setState({ status: 'signedOut', user: null, error });
    }
  }, []);

  useEffect(() => {
    let active = true;
    setUnauthorizedListener(() => {
      if (active) applySession(null);
    });
    void (async () => {
      try {
        const user = await fetchSession();
        if (active) applySession(user);
      } catch (error) {
        if (!active) return;
        applySession(
          null,
          error instanceof ApiError ? error.message : 'Unable to reach the server.',
        );
      }
    })();
    return () => {
      active = false;
      setUnauthorizedListener(null);
    };
  }, [fetchSession, applySession]);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await api.login(email, password);
    setState({ status: 'signedIn', user, error: null });
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const { user } = await api.signup(email, password);
    setState({ status: 'signedIn', user, error: null });
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setState({ status: 'signedOut', user: null, error: null });
  }, []);

  const updateProfile = useCallback(
    async (profile: { firstName: string; lastName: string; color?: string }) => {
      const { user } = await api.updateProfile(profile);
      setState({ status: 'signedIn', user, error: null });
    },
    [],
  );

  const retryBootstrap = useCallback(() => {
    setState({ status: 'bootstrapping', user: null, error: null });
    void (async () => {
      try {
        const user = await fetchSession();
        applySession(user);
      } catch (error) {
        applySession(
          null,
          error instanceof ApiError ? error.message : 'Unable to reach the server.',
        );
      }
    })();
  }, [fetchSession, applySession]);

  const value = useMemo(
    () => ({
      status: state.status,
      user: state.user,
      error: state.error,
      login,
      signup,
      logout,
      updateProfile,
      retryBootstrap,
    }),
    [state.status, state.user, state.error, login, signup, logout, updateProfile, retryBootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
