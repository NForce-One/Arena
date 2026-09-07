import type { GroundSearchResultDto } from '@nforce/shared';
import { requestBookingSchema } from '@nforce/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { DateField } from '../../DateField';
import { TimeField } from '../../TimeField';
import { api } from '../../../lib/apiClient';
import { todayISODate, wallClockToISO } from '../../../lib/calendar';
import { errorsFrom, validateForm } from '../../../lib/forms';
import { describeAvailability } from '../../../lib/grounds';
import { PageTabs } from '../ui/PageTabs';
import styles from './OrganizerBookingsPage.module.css';

const TABS = [
  { to: '/organizer/bookings', label: 'My Booking Requests', end: true },
  { to: '/organizer/bookings/browse', label: 'Available Grounds' },
];

function InlineBanner({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  return (
    <div
      className={`${styles.banner ?? ''} ${kind === 'error' ? (styles.bannerError ?? '') : (styles.bannerSuccess ?? '')}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export function DashboardOrganizerBookingsBrowsePage() {
  const [grounds, setGrounds] = useState<GroundSearchResultDto[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [openGroundId, setOpenGroundId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const loadGrounds = useCallback(async (q: string) => {
    try {
      const data = await api<{ grounds: GroundSearchResultDto[] }>(
        `/api/grounds/search?q=${encodeURIComponent(q)}`,
      );
      setGrounds(data.grounds);
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void loadGrounds(query);
  }, [loadGrounds, query]);

  function openRequest(groundId: string) {
    setOpenGroundId(groundId);
    setDate('');
    setStartTime('');
    setEndTime('');
    setFieldError(null);
  }

  async function submitRequest(groundId: string) {
    setFieldError(null);
    setError(null);
    setNotice(null);
    if (!date || !startTime || !endTime) {
      setFieldError('Pick a date, a start time and an end time.');
      return;
    }
    const startsAt = wallClockToISO(date, startTime);
    const endsAt = wallClockToISO(date, endTime);

    const parsed = validateForm(requestBookingSchema, { groundId, startsAt, endsAt });
    if (!parsed.ok) {
      setFieldError(Object.values(parsed.fields)[0] ?? 'Please check the times.');
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/bookings', { body: parsed.data });
      setNotice(
        'Booking request sent. The ground owner will confirm or decline it. See it on the My Booking Requests tab.',
      );
      setOpenGroundId(null);
    } catch (err) {
      const { fields, banner } = errorsFrom(err);
      setFieldError(banner ?? Object.values(fields)[0] ?? 'Could not send the request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageTabs items={TABS} />

      <section className={styles.panel} aria-label="Available grounds">
        <header className={styles.header}>
          <h2 className={styles.h2}>Ground Bookings</h2>
          <p className={styles.deck}>
            Browse grounds owners have listed, request a slot, and track each request from the My
            Booking Requests tab. The ground owner confirms or declines every request.
          </p>
        </header>

        {error && <InlineBanner kind="error">{error}</InlineBanner>}
        {notice && <InlineBanner kind="success">{notice}</InlineBanner>}

        <div className={styles.searchField}>
          <input
            className={styles.input}
            placeholder="Search grounds by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {grounds.length === 0 ? (
          <p className={styles.deck}>No grounds match your search.</p>
        ) : (
          <div className={styles.groundList}>
            {grounds.map((g) => (
              <div key={g.id} className={styles.groundRow}>
                <div className={styles.groundHead}>
                  <div>
                    <h3 className={styles.groundName}>{g.name}</h3>
                    <p className={styles.groundMeta}>
                      {g.location}
                      {g.capacity != null ? ` · capacity ${g.capacity}` : ''}
                    </p>
                    <p className={styles.groundAvailability}>
                      Available: {describeAvailability(g.availabilityRules)}
                    </p>
                  </div>
                  {openGroundId !== g.id && (
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => openRequest(g.id)}
                    >
                      Request booking
                    </button>
                  )}
                </div>

                {openGroundId === g.id && (
                  <div className={styles.requestForm}>
                    <DateField
                      value={date}
                      onChange={setDate}
                      ariaLabel="Date"
                      min={todayISODate()}
                    />
                    <TimeField value={startTime} onChange={setStartTime} ariaLabel="Start time" />
                    <TimeField value={endTime} onChange={setEndTime} ariaLabel="End time" />
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={submitting}
                      onClick={() => void submitRequest(g.id)}
                    >
                      {submitting ? 'Sending…' : 'Send request'}
                    </button>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      disabled={submitting}
                      onClick={() => setOpenGroundId(null)}
                    >
                      Cancel
                    </button>
                    {fieldError && <p className={styles.fieldError}>{fieldError}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
