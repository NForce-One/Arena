import type { RoleName } from '@nforce/shared';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { CricketLoader } from '../components/CricketLoader';
import { useAuth } from './AuthContext';

export function RequireRole({ roles, children }: { roles: RoleName[]; children: ReactNode }) {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="page-loading">
        <CricketLoader label="Loading…" size="block" />
      </div>
    );
  }

  const allowed = user?.roles.some((r) => roles.includes(r)) ?? false;

  if (!allowed) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
