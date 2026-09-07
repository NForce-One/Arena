import type { RoleName } from '@nforce/shared';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { BrandMark } from '../../BrandMark';
import { useAuth } from '../../../auth/AuthContext';
import { usePendingCounts } from '../../../auth/PendingCountsContext';
import { useUnread } from '../../../auth/UnreadContext';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon, type IconName } from '../ui/Icon';
import styles from './Sidebar.module.css';

interface SidebarProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

interface NavSection {
  roles?: RoleName[];
  excludeRoles?: RoleName[];
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    items: [
      { to: '/tournaments', label: 'Tournaments', icon: 'trophy' },
      { to: '/notifications', label: 'Notifications', icon: 'bell' },
    ],
  },
  {
    roles: ['team_manager'],
    excludeRoles: ['organizer'],
    items: [{ to: '/fixtures', label: 'Fixtures', icon: 'calendar' }],
  },
  {
    roles: ['player'],
    items: [{ to: '/player', label: 'My Requests', icon: 'bell' }],
  },
  {
    roles: ['organizer'],
    items: [
      { to: '/organizer/tournaments', label: 'My Tournaments', icon: 'clipboard' },
      { to: '/organizer/bookings', label: 'My Bookings', icon: 'calendar' },
    ],
  },
  {
    roles: ['team_manager'],
    items: [{ to: '/teams', label: 'My Teams', icon: 'users' }],
  },
  {
    roles: ['ground_owner'],
    items: [{ to: '/grounds', label: 'My Grounds', icon: 'map-pin' }],
  },
  {
    roles: ['umpire'],
    items: [{ to: '/umpire', label: 'Umpire', icon: 'shield-check' }],
  },
  {
    roles: ['parent'],
    items: [{ to: '/parent', label: 'My Children', icon: 'users' }],
  },
  {
    roles: ['platform_admin'],
    items: [
      { to: '/admin/users', label: 'Users & Roles', icon: 'users' },
      { to: '/admin/announcements', label: 'Announcements', icon: 'mega' },
      { to: '/admin/contact-messages', label: 'Contact Requests', icon: 'envelope' },
      { to: '/admin/audit', label: 'Audit Log', icon: 'clipboard' },
      { to: '/admin/child-accounts', label: 'Child Accounts', icon: 'person' },
    ],
  },
  {
    items: [{ to: '/profile', label: 'Profile', icon: 'person' }],
  },
  {
    excludeRoles: ['platform_admin'],
    items: [
      { to: '/request-role', label: 'Request a Role', icon: 'star' },
      { to: '/contact', label: 'Contact', icon: 'envelope' },
    ],
  },
];

export function Sidebar({ collapsed, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth();
  const { unread } = useUnread();
  const { groundBookings, umpireInvites } = usePendingCounts();
  const roles = user?.roles ?? [];
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const navigate = useNavigate();
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const sections = SECTIONS.filter(
    (s) =>
      (!s.roles || s.roles.some((r) => roles.includes(r))) &&
      !s.excludeRoles?.some((r) => roles.includes(r)),
  );

  const badgeFor: Partial<Record<string, number>> = {
    '/notifications': unread,
    '/grounds': groundBookings,
    '/umpire': umpireInvites,
  };

  const handleNav = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      onNavigate?.();
    }
  };

  return (
    <aside ref={asideRef} className={`${styles.aside} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.brand}>
        <BrandMark size={44} />
        <div className={styles.brandText}>
          <div className={styles.brandWord}>
            NFORCE
            <br />
            <b>ARENA</b>
          </div>
          <div className={styles.brandTag}>TOURNAMENTS</div>
        </div>
      </div>

      <nav className={styles.nav}>
        {sections.map((section, i) => (
          <div key={i}>
            {i > 0 && <div className={styles.divider} />}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={handleNav}
                className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
              >
                <span className={styles.itemIcon}>
                  <Icon name={item.icon} size={20} />
                </span>
                <span className={styles.itemLabel}>{item.label}</span>
                {!!badgeFor[item.to] && (
                  <span className={styles.itemBadge}>
                    {badgeFor[item.to]! > 99 ? '99+' : badgeFor[item.to]}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className={styles.divider} />

      {user ? (
        <button type="button" className={styles.logout} onClick={() => setConfirmingLogout(true)}>
          <span className={styles.itemIcon}>
            <Icon name="logout" size={20} />
          </span>
          <span className={styles.itemLabel}>Log out</span>
        </button>
      ) : (
        <NavLink
          to="/login"
          onClick={handleNav}
          className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
        >
          <span className={styles.itemIcon}>
            <Icon name="person" size={20} />
          </span>
          <span className={styles.itemLabel}>Log in</span>
        </NavLink>
      )}

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

      <div className={styles.spacer} />

      <div className={styles.photo} aria-hidden="true" />
    </aside>
  );
}
