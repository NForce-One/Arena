import type { ReactNode } from 'react';
import { CricketLoader } from '../components/CricketLoader';
import { Navigate } from 'react-router';
import { useAuth } from './AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="page-loading">
        <CricketLoader label="Loading…" size="block" />
      </div>
    );
  }
  if (status === 'anon') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
