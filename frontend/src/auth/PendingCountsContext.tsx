import type { GroundBookingDto, OpenFixtureDto } from '@nforce/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/apiClient';
import { useAuth } from './AuthContext';

interface PendingCountsValue {
  groundBookings: number;
  umpireInvites: number;
  refresh: () => void;
}

const PendingCountsContext = createContext<PendingCountsValue>({
  groundBookings: 0,
  umpireInvites: 0,
  refresh: () => {},
});

const POLL_MS = 60_000;

export function PendingCountsProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const [groundBookings, setGroundBookings] = useState(0);
  const [umpireInvites, setUmpireInvites] = useState(0);
  const isGroundOwner = user?.roles.includes('ground_owner') ?? false;
  const isUmpire = user?.roles.includes('umpire') ?? false;

  const refresh = useCallback(() => {
    if (status !== 'authed') {
      setGroundBookings(0);
      setUmpireInvites(0);
      return;
    }
    if (isGroundOwner) {
      void api<{ bookings: GroundBookingDto[] }>('/api/grounds/bookings')
        .then((d) => setGroundBookings(d.bookings.filter((b) => b.status === 'requested').length))
        .catch(() => undefined);
    } else {
      setGroundBookings(0);
    }
    if (isUmpire) {
      void api<{ fixtures: OpenFixtureDto[] }>('/api/umpire/open-fixtures')
        .then((d) => setUmpireInvites(d.fixtures.filter((f) => f.myStatus === 'invited').length))
        .catch(() => undefined);
    } else {
      setUmpireInvites(0);
    }
  }, [status, isGroundOwner, isUmpire]);

  useEffect(() => {
    refresh();
    if (status !== 'authed') return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, status]);

  return (
    <PendingCountsContext.Provider value={{ groundBookings, umpireInvites, refresh }}>
      {children}
    </PendingCountsContext.Provider>
  );
}

export function usePendingCounts(): PendingCountsValue {
  return useContext(PendingCountsContext);
}
