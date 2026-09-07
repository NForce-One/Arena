import type { NotificationDto } from '@nforce/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../../auth/AuthContext';
import { useUnread } from '../../../auth/UnreadContext';
import { api } from '../../../lib/apiClient';
import { relativeTime, tooltipTime } from '../../../lib/dashboardTime';
import { BrandMark } from '../../BrandMark';
import { ThemeToggle } from './ThemeToggle';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import styles from './Topbar.module.css';

interface TopbarProps {
  onMenuToggle: () => void;
  showMenuToggle?: boolean;
}

type OpenMenu = null | 'bell' | 'user';

export function Topbar({ onMenuToggle, showMenuToggle = true }: TopbarProps) {
  const { user, logout } = useAuth();
  const { unread, refresh } = useUnread();
  const { query, setQuery, clear } = useSearchQuery();
  const [open, setOpen] = useState<OpenMenu>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [recent, setRecent] = useState<NotificationDto[]>([]);
  const bellRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open !== 'bell') return;
    void api<{ notifications: NotificationDto[] }>('/api/notifications')
      .then((d) => setRecent(d.notifications.filter((n) => !n.readAt).slice(0, 3)))
      .catch(() => setRecent([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (bellRef.current?.contains(t)) return;
      if (userRef.current?.contains(t)) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const goTo = (path: string) => {
    setOpen(null);
    navigate(path);
  };

  const handleLogout = () => {
    setOpen(null);
    setConfirmingLogout(true);
  };

  const initials = useMemo(() => {
    if (!user) return '';
    const parts = user.name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }, [user]);

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        {showMenuToggle ? (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onMenuToggle}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          >
            <Icon name="menu" size={20} />
          </button>
        ) : (
          <Link to="/" className={styles.brand} aria-label="NForce Arena home">
            <BrandMark size={28} />
            <span className={styles.brandWord}>
              NForce <b>Arena</b>
            </span>
          </Link>
        )}
      </div>

      <label className={styles.search}>
        <span className={styles.searchIcon}>
          <Icon name="search" size={18} />
        </span>
        <input
          type="text"
          placeholder="Search tournaments, teams, notifications…"
          className={styles.searchInput}
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.length > 0 && (
          <button
            type="button"
            className={styles.searchClear}
            onClick={clear}
            aria-label="Clear search"
            title="Clear search"
          >
            ×
          </button>
        )}
      </label>

      <div className={styles.right}>
        {user && (
          <div className={styles.menuAnchor} ref={bellRef}>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.bell}`}
              aria-label={`Notifications (${unread})`}
              aria-haspopup="menu"
              aria-expanded={open === 'bell'}
              title="Notifications"
              onClick={() => setOpen(open === 'bell' ? null : 'bell')}
            >
              <Icon name="bell" size={20} />
              {unread > 0 && <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>}
            </button>
            {open === 'bell' && (
              <div className={styles.popover} role="menu" aria-label="Recent notifications">
                <div className={styles.popHead}>
                  <span className={styles.popTitle}>Notifications</span>
                  {unread > 0 && <span className={styles.popCount}>{unread} unread</span>}
                </div>
                {recent.length > 0 ? (
                  <ul className={styles.popList}>
                    {recent.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          className={styles.popItem}
                          role="menuitem"
                          onClick={() => goTo('/notifications')}
                        >
                          <span className={styles.popDot} aria-hidden="true" />
                          <span className={styles.popItemBody}>
                            <span className={styles.popItemTitle} title={n.title}>
                              {n.title}
                            </span>
                            <span className={styles.popItemText} title={n.body}>
                              {n.body}
                            </span>
                          </span>
                          <span className={styles.popItemTime} title={tooltipTime(n.createdAt)}>
                            {relativeTime(n.createdAt)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.popEmpty}>You&apos;re all caught up.</div>
                )}
                <Link
                  to="/notifications"
                  className={styles.popFoot}
                  role="menuitem"
                  onClick={() => {
                    setOpen(null);
                    refresh();
                  }}
                >
                  See all
                  <Icon name="arrow-right" size={14} />
                </Link>
              </div>
            )}
          </div>
        )}

        <ThemeToggle />

        {user ? (
          <div className={styles.menuAnchor} ref={userRef}>
            <button
              type="button"
              className={styles.user}
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={open === 'user'}
              onClick={() => setOpen(open === 'user' ? null : 'user')}
            >
              <span className={styles.avatar}>{initials}</span>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.chev}>
                <Icon name="chevron-down" size={16} />
              </span>
            </button>
            {open === 'user' && (
              <div
                className={`${styles.popover} ${styles.popoverUser}`}
                role="menu"
                aria-label="Account menu"
              >
                <div className={styles.userHead}>
                  <span className={styles.avatarLg}>{initials}</span>
                  <span className={styles.userMeta}>
                    <span className={styles.userMetaName}>{user.name}</span>
                    <span className={styles.userMetaEmail} title={user.email}>
                      {user.email}
                    </span>
                  </span>
                </div>
                <div className={styles.popDivider} />
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => goTo('/profile')}
                >
                  <Icon name="person" size={16} />
                  <span>Profile</span>
                </button>
                <div className={styles.popDivider} />
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                  onClick={handleLogout}
                >
                  <Icon name="logout" size={16} />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.authButtons}>
            <Link to="/login" className={styles.authLogin}>
              Log in
            </Link>
            <Link to="/signup" className={styles.authSignup}>
              Sign up
            </Link>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmingLogout}
        title="Log out?"
        message="You'll need to sign in again to get back to your dashboard."
        confirmLabel="Log out"
        onConfirm={() => {
          setConfirmingLogout(false);
          navigate('/');
          void logout();
        }}
        onCancel={() => setConfirmingLogout(false)}
      />
    </header>
  );
}
