import { useAuth } from '../auth/AuthContext';
import type { PageTabItem } from '../components/dashboard/ui/PageTabs';

export function useTournamentsPageTabs(): PageTabItem[] {
  const { user } = useAuth();
  const canSeeMine = user?.roles.some((r) => r === 'team_manager') ?? false;
  if (!canSeeMine) return [];
  return [
    { to: '/tournaments', label: 'All Tournaments', end: true },
    { to: '/tournaments/mine', label: 'My Tournaments' },
  ];
}
