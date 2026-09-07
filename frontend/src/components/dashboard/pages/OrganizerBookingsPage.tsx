import type { GroundBookingDto } from '@nforce/shared';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../../lib/apiClient';
import { formatSlot, wallTime } from '../../../lib/calendar';
import { errorsFrom } from '../../../lib/forms';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import { PageTabs } from '../ui/PageTabs';
import styles from './OrganizerBookingsPage.module.css';

const TABS = [
  { to: '/organizer/bookings', label: 'My Booking Requests', end: true },
  { to: '/organizer/bookings/browse', label: 'Available Grounds' },
];

type BookingStatus = GroundBookingDto['status'];
const BOOKING_TABS: { key: BookingStatus; label: string }[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'declined', label: 'Declined' },
  { key: 'cancelled', label: 'Cancelled' },
];

function InlineBanner({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.banner ?? ''} ${styles.bannerError ?? ''}`} role="alert">
      {children}
    </div>
  );
}

export function DashboardOrganizerBookingsPage() {
  const [bookings, setBookings] = useState<GroundBookingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GroundBookingDto | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [bookingTab, setBookingTab] = useState<BookingStatus>('requested');
  const [pillReady, setPillReady] = useState(false);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const chipRefs = useRef(new Map<BookingStatus, HTMLButtonElement | null>());

  const { query: topbarQuery } = useSearchQuery();
  const tq = topbarQuery.trim().toLowerCase();

  const loadBookings = useCallback(async () => {
    try {
      const data = await api<{ bookings: GroundBookingDto[] }>('/api/bookings/mine');
      setBookings(data.bookings);
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  useLayoutEffect(() => {
    const el = chipRefs.current.get(bookingTab);
    if (!el) return;
    setPill({ left: el.offsetLeft, width: el.offsetWidth });
    const raf = requestAnimationFrame(() => setPillReady(true));
    return () => cancelAnimationFrame(raf);
  }, [bookingTab, bookings]);

  async function cancel(bookingId: string) {
    setError(null);
    setCancelling(true);
    try {
      await api(`/api/bookings/${bookingId}/cancel`, { method: 'POST' });
      await loadBookings();
      setCancelTarget(null);
    } catch (err) {
      setError(errorsFrom(err).banner);
    } finally {
      setCancelling(false);
    }
  }

  const tabBookings = (bookings ?? []).filter((b) => b.status === bookingTab);
  const visibleBookings = tq
    ? tabBookings.filter((b) => b.groundName.toLowerCase().includes(tq))
    : tabBookings;

  return (
    <div className={styles.page}>
      <PageTabs items={TABS} />

      <section className={styles.panel} aria-label="My booking requests">
        <header className={styles.header}>
          <h2 className={styles.h2}>My Booking Requests</h2>
          <p className={styles.deck}>
            Every request you&apos;ve sent, whether from the Available Grounds tab or created
            implicitly by scheduling a match with a ground. The ground owner confirms or declines
            each one.
          </p>
        </header>

        {error && <InlineBanner>{error}</InlineBanner>}

        {bookings === null && !error && <p className={styles.deck}>Loading…</p>}

        {bookings?.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Icon name="calendar" size={26} />
            </span>
            <p className={styles.emptyBody}>
              No booking requests yet. Request one from the Available Grounds tab, or schedule a
              match with a ground.
            </p>
          </div>
        )}

        {bookings && bookings.length > 0 && (
          <>
            <div className={styles.filters} role="tablist" aria-label="Filter bookings">
              <span
                className={`${styles.pill ?? ''} ${pillReady ? (styles.pillReady ?? '') : ''}`}
                style={{ transform: `translateX(${pill.left}px)`, width: `${pill.width}px` }}
                aria-hidden="true"
              />
              {BOOKING_TABS.map((t) => {
                const count = bookings.filter((b) => b.status === t.key).length;
                return (
                  <button
                    key={t.key}
                    ref={(el) => {
                      chipRefs.current.set(t.key, el);
                    }}
                    type="button"
                    role="tab"
                    aria-selected={bookingTab === t.key}
                    className={`${styles.chip ?? ''} ${bookingTab === t.key ? (styles.chipActive ?? '') : ''}`}
                    onClick={() => setBookingTab(t.key)}
                  >
                    {t.label} ({count})
                  </button>
                );
              })}
            </div>

            {visibleBookings.length === 0 ? (
              <p className={styles.deck}>
                {tq
                  ? `No ${bookingTab} bookings match "${topbarQuery.trim()}".`
                  : `No ${bookingTab} bookings.`}
              </p>
            ) : (
              <div className={styles.rows}>
                {visibleBookings.map((b) => (
                  <div className={styles.bookingRow} key={b.id}>
                    <div>
                      <h3 className={styles.bookingName}>{b.groundName}</h3>
                      <p className={styles.bookingMeta}>
                        {formatSlot(b.startsAt)} – {wallTime(b.endsAt)}
                      </p>
                    </div>
                    {(b.status === 'requested' || b.status === 'confirmed') && (
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => setCancelTarget(b)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancel this booking?"
        message={
          cancelTarget
            ? `This frees up ${cancelTarget.groundName} on ${formatSlot(cancelTarget.startsAt)}. This can't be undone.`
            : ''
        }
        confirmLabel={cancelling ? 'Cancelling…' : 'Cancel booking'}
        onConfirm={() => cancelTarget && void cancel(cancelTarget.id)}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
