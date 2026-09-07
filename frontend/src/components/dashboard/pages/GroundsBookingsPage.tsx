import type { GroundBookingDto } from '@nforce/shared';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';
import { api } from '../../../lib/apiClient';
import { formatSlot, wallTime } from '../../../lib/calendar';
import { errorsFrom } from '../../../lib/forms';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import type { GroundsOutletContext } from './GroundsLayout';
import styles from './GroundsPage.module.css';

type BookingStatus = GroundBookingDto['status'];

const BOOKING_TABS: { key: BookingStatus; label: string }[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'declined', label: 'Declined' },
  { key: 'cancelled', label: 'Cancelled' },
];

type BookingAction = 'confirm' | 'decline' | 'cancel';

const BOOKING_ACTION_COPY: Record<
  BookingAction,
  { title: string; confirmLabel: string; message: (b: GroundBookingDto) => string }
> = {
  confirm: {
    title: 'Confirm this booking?',
    confirmLabel: 'Confirm booking',
    message: (b) =>
      `This locks in ${b.groundName} for ${b.requesterName}'s request (${formatSlot(b.startsAt)} – ${wallTime(b.endsAt)}). They'll be notified.`,
  },
  decline: {
    title: 'Decline this booking request?',
    confirmLabel: 'Decline',
    message: (b) =>
      `${b.requesterName}'s request for ${b.groundName} will be rejected, and they'll be notified.`,
  },
  cancel: {
    title: 'Cancel this booking?',
    confirmLabel: 'Cancel booking',
    message: (b) =>
      `This frees up the slot on ${b.groundName} and notifies ${b.requesterName}. This can't be undone.`,
  },
};

export function DashboardGroundsBookingsPage() {
  const { bookings, bookingsError, reloadBookings, grounds } =
    useOutletContext<GroundsOutletContext>();
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();

  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<BookingStatus>('requested');
  const [groundFilter, setGroundFilter] = useState<string>('all');
  const [pillReady, setPillReady] = useState(false);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const chipRefs = useRef(new Map<BookingStatus, HTMLButtonElement | null>());
  const [pendingAction, setPendingAction] = useState<{
    booking: GroundBookingDto;
    action: BookingAction;
  } | null>(null);
  const [acting, setActing] = useState(false);

  async function act(bookingId: string, action: BookingAction) {
    setError(null);
    setActing(true);
    try {
      await api(`/api/bookings/${bookingId}/${action}`, { method: 'POST' });
      await reloadBookings();
    } catch (err) {
      setError(errorsFrom(err).banner);
    } finally {
      setActing(false);
      setPendingAction(null);
    }
  }

  const shown = useMemo(() => {
    const byTab = (bookings ?? []).filter((b) => b.status === tab);
    const byGround =
      groundFilter === 'all' ? byTab : byTab.filter((b) => b.groundId === groundFilter);
    if (!q) return byGround;
    return byGround.filter(
      (b) => b.groundName.toLowerCase().includes(q) || b.requesterName.toLowerCase().includes(q),
    );
  }, [bookings, tab, groundFilter, q]);

  useLayoutEffect(() => {
    const el = chipRefs.current.get(tab);
    if (!el) return;
    setPill({ left: el.offsetLeft, width: el.offsetWidth });
    const raf = requestAnimationFrame(() => setPillReady(true));
    return () => cancelAnimationFrame(raf);
  }, [tab, bookings]);

  if (bookings === null && !bookingsError) {
    return (
      <section className={styles.panel} aria-label="Booking requests">
        <p className={styles.deck}>Loading…</p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="Booking requests">
      <header className={styles.header}>
        <div className={styles.headText}>
          <h2 className={styles.h2}>Booking requests</h2>
          <p className={styles.deck}>Most recently received first.</p>
        </div>
        <div className={styles.filterGroup}>
          {grounds && grounds.length > 1 && (
            <label className={styles.selectWrap}>
              <span className={styles.srOnly}>Filter by ground</span>
              <select
                className={styles.select}
                value={groundFilter}
                onChange={(e) => setGroundFilter(e.target.value)}
              >
                <option value="all">All grounds</option>
                {grounds.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className={styles.filters} role="tablist" aria-label="Filter bookings">
            <span
              className={`${styles.pill ?? ''} ${pillReady ? (styles.pillReady ?? '') : ''}`}
              style={{ transform: `translateX(${pill.left}px)`, width: `${pill.width}px` }}
              aria-hidden="true"
            />
            {BOOKING_TABS.map((t) => {
              const inGround = (b: GroundBookingDto) =>
                groundFilter === 'all' || b.groundId === groundFilter;
              const count = (bookings ?? []).filter(
                (b) => b.status === t.key && inGround(b),
              ).length;
              return (
                <button
                  key={t.key}
                  ref={(el) => {
                    chipRefs.current.set(t.key, el);
                  }}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  className={`${styles.chip ?? ''} ${tab === t.key ? (styles.chipActive ?? '') : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {(bookingsError ?? error) && <p className={styles.actionError}>{bookingsError ?? error}</p>}

      {shown.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon name="clipboard" size={30} />
          </span>
          <h3 className={styles.emptyTitle}>
            {q
              ? `No bookings match "${query.trim()}"`
              : (bookings ?? []).length === 0
                ? 'No booking requests yet'
                : `No ${tab} bookings`}
          </h3>
          <p className={styles.emptyBody}>
            {q
              ? 'Try a different ground or requester name.'
              : 'When an organizer requests this ground, it will show up here.'}
          </p>
        </div>
      ) : (
        <div key={`${tab}-${q}`} className={styles.rows}>
          {shown.map((b, i) => (
            <div
              className={styles.bookingRow}
              key={b.id}
              style={{ animationDelay: `${40 + i * 30}ms` }}
            >
              <div className={styles.bookingInfo}>
                <span className={styles.bookingGround}>{b.groundName}</span>
                <span className={styles.bookingMeta}>
                  {formatSlot(b.startsAt)} – {wallTime(b.endsAt)} · requested by {b.requesterName}
                </span>
              </div>
              <div className={styles.bookingActions}>
                {b.status === 'requested' && (
                  <>
                    <button
                      type="button"
                      className={styles.btnPrimarySmall}
                      onClick={() => {
                        setError(null);
                        setPendingAction({ booking: b, action: 'confirm' });
                      }}
                    >
                      <Icon name="shield-check" size={13} />
                      <span>Confirm</span>
                    </button>
                    <button
                      type="button"
                      className={styles.btnGhostSmall}
                      onClick={() => {
                        setError(null);
                        setPendingAction({ booking: b, action: 'decline' });
                      }}
                    >
                      Decline
                    </button>
                  </>
                )}
                {}
                {b.status === 'confirmed' && (
                  <button
                    type="button"
                    className={styles.btnGhostSmall}
                    onClick={() => {
                      setError(null);
                      setPendingAction({ booking: b, action: 'cancel' });
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction ? BOOKING_ACTION_COPY[pendingAction.action].title : ''}
        message={
          pendingAction
            ? BOOKING_ACTION_COPY[pendingAction.action].message(pendingAction.booking)
            : ''
        }
        confirmLabel={
          acting
            ? 'Working…'
            : pendingAction
              ? BOOKING_ACTION_COPY[pendingAction.action].confirmLabel
              : 'Confirm'
        }
        onConfirm={() => pendingAction && void act(pendingAction.booking.id, pendingAction.action)}
        onCancel={() => {
          setPendingAction(null);
          setError(null);
        }}
        busy={acting}
      />
    </section>
  );
}
