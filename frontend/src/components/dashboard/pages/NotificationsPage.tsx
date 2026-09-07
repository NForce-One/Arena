import type { NotificationDto } from '@nforce/shared';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useUnread } from '../../../auth/UnreadContext';
import { api } from '../../../lib/apiClient';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { NotificationCard } from '../ui/NotificationCard';
import { Icon } from '../ui/Icon';
import styles from './NotificationsPage.module.css';

type Filter = 'all' | 'unread' | 'read';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
];

export function DashboardNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [pillReady, setPillReady] = useState(false);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const chipRefs = useRef(new Map<Filter, HTMLButtonElement | null>());
  const { refresh: refreshUnread } = useUnread();

  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();

  const load = useCallback(async () => {
    try {
      const data = await api<{ notifications: NotificationDto[] }>('/api/notifications');
      setNotifications(data.notifications);
    } catch {
      setError('Could not load notifications.');
    }
  }, []);

  useEffect(() => {
    void load();
    refreshUnread();
  }, [load, refreshUnread]);

  const unreadCount = (notifications ?? []).filter((n) => !n.readAt).length;

  const visible = useMemo(() => {
    let list = notifications ?? [];
    if (filter === 'unread') list = list.filter((n) => !n.readAt);
    else if (filter === 'read') list = list.filter((n) => n.readAt);
    if (q) {
      list = list.filter(
        (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
      );
    }
    return list;
  }, [filter, notifications, q]);

  useLayoutEffect(() => {
    const el = chipRefs.current.get(filter);
    if (!el) return;
    setPill({ left: el.offsetLeft, width: el.offsetWidth });
    const raf = requestAnimationFrame(() => setPillReady(true));
    return () => cancelAnimationFrame(raf);
  }, [filter, notifications]);

  async function markOne(id: string) {
    setActionError(null);
    try {
      await api(`/api/notifications/${id}/read`, { method: 'POST' });
      await load();
      refreshUnread();
    } catch {
      setActionError('Could not mark that notification as read. Try again.');
    }
  }

  async function markOneUnread(id: string) {
    setActionError(null);
    try {
      await api(`/api/notifications/${id}/unread`, { method: 'POST' });
      await load();
      refreshUnread();
    } catch {
      setActionError('Could not mark that notification as unread. Try again.');
    }
  }

  async function markAll() {
    setActionError(null);
    try {
      await api('/api/notifications/read-all', { method: 'POST' });
      await load();
      refreshUnread();
    } catch {
      setActionError('Could not mark all as read. Try again.');
    }
  }

  const emptyTitle = q
    ? `No notifications match "${query.trim()}"`
    : filter === 'unread'
      ? "You're all caught up"
      : filter === 'read'
        ? 'Nothing marked read yet'
        : 'No notifications yet';
  const emptyBody = q
    ? 'Try a different title or keyword.'
    : filter === 'unread'
      ? 'Fresh announcements and approvals will appear here first.'
      : filter === 'read'
        ? "Notifications you've marked as read will show up here."
        : "When organizers, teammates or the arena system have something for you, it'll appear here.";

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="Notifications">
        <header className={styles.header}>
          <div className={styles.headText}>
            <h2 className={styles.h2}>Notifications</h2>
            <p className={styles.deck}>
              Announcements, approvals and schedule updates land here first.
            </p>
            {unreadCount > 0 && (
              <button type="button" className={styles.markAll} onClick={() => void markAll()}>
                <Icon name="shield-check" size={14} />
                <span>Mark all read</span>
              </button>
            )}
          </div>
          <div className={styles.filters} role="tablist" aria-label="Filter notifications">
            <span
              className={`${styles.pill ?? ''} ${pillReady ? (styles.pillReady ?? '') : ''}`}
              style={{ transform: `translateX(${pill.left}px)`, width: `${pill.width}px` }}
              aria-hidden="true"
            />
            {FILTERS.map((f) => (
              <button
                key={f.id}
                ref={(el) => {
                  chipRefs.current.set(f.id, el);
                }}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`${styles.chip ?? ''} ${filter === f.id ? (styles.chipActive ?? '') : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </header>

        {error && <p className={styles.empty}>{error}</p>}
        {!error && actionError && <p className="field-error">{actionError}</p>}
        {!error && notifications === null && <p className={styles.deck}>Loading…</p>}

        {!error &&
          notifications !== null &&
          (visible.length > 0 ? (
            <div key={`${filter}-${q}`} className={styles.rows}>
              {visible.map((n, i) => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  index={i}
                  onMarkRead={markOne}
                  onMarkUnread={markOneUnread}
                />
              ))}
            </div>
          ) : (
            <div key={`empty-${filter}-${q}`} className={styles.empty}>
              <span className={styles.emptyIcon}>
                <Icon name="bell" size={30} />
              </span>
              <h3 className={styles.emptyTitle}>{emptyTitle}</h3>
              <p className={styles.emptyBody}>{emptyBody}</p>
            </div>
          ))}
      </section>
    </div>
  );
}
