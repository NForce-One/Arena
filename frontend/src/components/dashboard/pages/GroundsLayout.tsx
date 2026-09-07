import type { GroundBookingDto, GroundDto } from '@nforce/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router';
import { api } from '../../../lib/apiClient';
import { errorsFrom } from '../../../lib/forms';
import { PageTabs, type PageTabItem } from '../ui/PageTabs';
import styles from './GroundsPage.module.css';

export interface GroundsOutletContext {
  grounds: GroundDto[] | null;
  groundsBanner: string | null;
  reloadGrounds: () => Promise<void>;
  bookings: GroundBookingDto[] | null;
  bookingsError: string | null;
  reloadBookings: () => Promise<void>;
}

export function DashboardGroundsLayout() {
  const [grounds, setGrounds] = useState<GroundDto[] | null>(null);
  const [groundsBanner, setGroundsBanner] = useState<string | null>(null);
  const [bookings, setBookings] = useState<GroundBookingDto[] | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  const reloadGrounds = useCallback(async () => {
    try {
      const data = await api<{ grounds: GroundDto[] }>('/api/grounds/mine');
      setGrounds(data.grounds);
    } catch (err) {
      setGroundsBanner(errorsFrom(err).banner);
    }
  }, []);

  const reloadBookings = useCallback(async () => {
    try {
      const data = await api<{ bookings: GroundBookingDto[] }>('/api/grounds/bookings');
      setBookings(data.bookings);
    } catch (err) {
      setBookingsError(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void reloadGrounds();
    void reloadBookings();
  }, [reloadGrounds, reloadBookings]);

  const pendingBookingCount = useMemo(
    () => (bookings ?? []).filter((b) => b.status === 'requested').length,
    [bookings],
  );

  const tabs: PageTabItem[] = [
    { to: '/grounds', label: 'My Grounds', end: true },
    { to: '/grounds/new', label: 'Add a Ground' },
    { to: '/grounds/bookings', label: 'Booking Requests', count: pendingBookingCount },
  ];

  const context: GroundsOutletContext = {
    grounds,
    groundsBanner,
    reloadGrounds,
    bookings,
    bookingsError,
    reloadBookings,
  };

  return (
    <div className={styles.page}>
      <PageTabs items={tabs} />
      <Outlet context={context} />
    </div>
  );
}
