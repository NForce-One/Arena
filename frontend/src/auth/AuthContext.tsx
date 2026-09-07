import type { AuthUserDto, LoginInput } from '@nforce/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, refreshSession, setAccessToken } from '../lib/apiClient';

export type AuthStatus = 'loading' | 'authed' | 'anon';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUserDto | null;
  login(input: LoginInput): Promise<AuthUserDto>;
  logout(): Promise<void>;
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUserDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    void refreshSession().then((restored) => {
      if (cancelled) return;
      setUser(restored);
      setStatus(restored ? 'authed' : 'anon');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const data = await api<{ user: AuthUserDto; accessToken: string }>('/api/auth/login', {
      body: input,
      skipAuthRetry: true,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('authed');
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', skipAuthRetry: true });
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus('anon');
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await api<{ user: AuthUserDto }>('/api/me');
    setUser(data.user);
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout, refreshUser }),
    [status, user, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
