import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '../../../auth/AuthContext';
import { useSidebar } from '../../../hooks/useSidebar';
import { SearchQueryProvider } from '../../../hooks/useSearchQuery';
import styles from './DashboardShell.module.css';

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const { user } = useAuth();
  const { collapsed, toggle, close } = useSidebar();
  const showBackdrop = !collapsed;
  return (
    <SearchQueryProvider>
      <div className={styles.shell}>
        {user && <Sidebar collapsed={collapsed} onNavigate={close} />}
        {user && (
          <button
            type="button"
            aria-label="Close sidebar"
            className={`${styles.backdrop} ${showBackdrop ? styles.backdropShown : ''}`}
            onClick={close}
            tabIndex={-1}
          />
        )}
        <div className={styles.main}>
          <Topbar onMenuToggle={toggle} showMenuToggle={!!user} />
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    </SearchQueryProvider>
  );
}
