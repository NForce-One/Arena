import { NavLink } from 'react-router';
import styles from './PageTabs.module.css';

export interface PageTabItem {
  to: string;
  label: string;
  end?: boolean;
  count?: number;
}

export function PageTabs({ items }: { items: PageTabItem[] }) {
  if (items.length <= 1) return null;
  return (
    <nav className={styles.nav} aria-label="Page navigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
        >
          <span>{item.label}</span>
          {!!item.count && (
            <span className={styles.badge}>{item.count > 99 ? '99+' : item.count}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
