import type { NotificationDto } from '@nforce/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/apiClient';
import { useAuth } from './AuthContext';

interface UnreadValue {
  unread: number;
  refresh: () => void;
}

const UnreadContext = createContext<UnreadValue>({ unread: 0, refresh: () => {} });

const POLL_MS = 60_000;

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    if (status !== 'authed') {
      setUnread(0);
      return;
    }
    void api<{ notifications: NotificationDto[]; unread: number }>('/api/notifications')
      .then((d) => setUnread(d.unread))
      .catch(() => undefined);
  }, [status]);

  useEffect(() => {
    refresh();
    if (status !== 'authed') return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, status]);

  return <UnreadContext.Provider value={{ unread, refresh }}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadValue {
  return useContext(UnreadContext);
}
