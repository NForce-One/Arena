import { useAuth } from '../auth/AuthContext';
import type { PageTabItem } from '../components/dashboard/ui/PageTabs';

export function useProfilePageTabs(): PageTabItem[] {
  const { user } = useAuth();
  const showAlerts = user?.roles.some((r) => r === 'player' || r === 'team_manager') ?? false;
  if (!showAlerts) return [];
  return [
    { to: '/profile', label: 'Profile', end: true },
    { to: '/profile/alerts', label: 'Tournament Alerts' },
  ];
}
