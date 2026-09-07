import type { NotificationDto, RoleName } from '@nforce/shared';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon';
import { relativeTime, tooltipTime } from '../../../lib/dashboardTime';
import styles from './NotificationCard.module.css';

const ROLE_HOME_ROUTE: Partial<Record<RoleName, string>> = {
  organizer: '/organizer/tournaments',
  team_manager: '/teams',
  ground_owner: '/grounds',
  umpire: '/umpire',
  parent: '/parent',
  platform_admin: '/admin/users',
  player: '/player',
};

function resolveGenericLink(
  notification: NotificationDto,
  childId: string | null,
): { label: string; to: string } | null {
  const payload = notification.payload;
  const str = (key: string): string | null =>
    typeof payload[key] === 'string' ? (payload[key] as string) : null;
  const tournamentId = str('tournamentId');
  const forRole = str('forRole');

  switch (notification.type) {
    case 'squad_join_request':
    case 'squad_invitation_response': {
      const teamId = str('teamId');
      return teamId ? { label: 'View team', to: `/teams/${teamId}` } : null;
    }
    case 'contact_message_submitted':
      return { label: 'View messages', to: '/admin/contact-messages' };
    case 'result_posted':
      return { label: 'View result', to: '/fixtures/results' };
    case 'role_request_submitted':
      return { label: 'Review request', to: '/admin/users?tab=role-requests' };
    case 'role_request_approved':
    case 'role_granted': {
      const to = ROLE_HOME_ROUTE[str('role') as RoleName];
      return to ? { label: 'Get started', to } : null;
    }
    case 'tournament_invitation_declined':
    case 'new_registration':
    case 'external_invite_joined':
      return tournamentId
        ? {
            label: 'View registrations',
            to: `/organizer/tournaments/${tournamentId}/registrations`,
          }
        : null;
    case 'registration_withdrawn':
      if (forRole === 'organizer') {
        return tournamentId
          ? {
              label: 'View registrations',
              to: `/organizer/tournaments/${tournamentId}/registrations`,
            }
          : null;
      }
      if (childId)
        return { label: 'View registrations', to: `/parent/children/${childId}/registrations` };
      return tournamentId ? { label: 'View tournament', to: `/tournaments/${tournamentId}` } : null;
    case 'booking_requested':
      return { label: 'View bookings', to: '/grounds/bookings' };
    case 'booking_confirmed':
    case 'booking_declined':
      return { label: 'View bookings', to: '/organizer/bookings' };
    case 'booking_cancelled':
      return {
        label: 'View bookings',
        to: forRole === 'ground_owner' ? '/grounds/bookings' : '/organizer/bookings',
      };
    case 'umpire_invited':
      return { label: 'View invites', to: '/umpire/invites' };
    case 'umpire_assigned':
      return { label: 'View schedule', to: '/umpire' };
    case 'fixture_scheduled':
      return { label: 'View fixtures', to: '/fixtures' };
    case 'fixture_rescheduled':
      return forRole === 'umpire'
        ? { label: 'View schedule', to: '/umpire' }
        : { label: 'View fixtures', to: '/fixtures' };
    case 'umpire_applied':
    case 'umpire_declined':
    case 'umpire_accepted':
      return tournamentId
        ? { label: 'View fixtures', to: `/organizer/tournaments/${tournamentId}/fixtures` }
        : null;
    default:
      return null;
  }
}

interface Props {
  notification: NotificationDto;
  index?: number;
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
}

function typeLabel(type: string): string {
  const words = type.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function NotificationCard({ notification, index = 0, onMarkRead, onMarkUnread }: Props) {
  const unread = !notification.readAt;
  const stagger: CSSProperties = { animationDelay: `${40 + index * 30}ms` };
  const childName = notification.payload['childName'];
  const childId = notification.payload['childId'];
  const isForChild = typeof childName === 'string' && typeof childId === 'string';
  const tournamentId = notification.payload['tournamentId'];

  const teamId = notification.payload['teamId'];
  const isSquadInvitation = notification.type === 'squad_invitation' && typeof teamId === 'string';
  const invitationId = notification.payload['invitationId'];
  const isPlayerTournamentInvitation =
    notification.type === 'tournament_invitation' && typeof invitationId === 'string';
  const isTeamTournamentInvitation =
    notification.type === 'tournament_invitation' &&
    typeof teamId === 'string' &&
    typeof invitationId !== 'string';
  const isActionableInvitation =
    isSquadInvitation || isPlayerTournamentInvitation || isTeamTournamentInvitation;
  const respondPath = isForChild
    ? '/parent'
    : isTeamTournamentInvitation && typeof teamId === 'string'
      ? `/teams/${teamId}/tournament-requests`
      : '/player';
  const isPendingTeamManagerInvite =
    notification.type === 'team_manager_invite_pending' && typeof tournamentId === 'string';
  const genericLink = resolveGenericLink(notification, isForChild ? (childId as string) : null);
  const hasTournamentLink =
    typeof tournamentId === 'string' &&
    !isActionableInvitation &&
    !isPendingTeamManagerInvite &&
    !genericLink;

  return (
    <article
      className={`${styles.card ?? ''} ${unread ? (styles.unread ?? '') : ''}`}
      style={stagger}
      aria-label={`${notification.title}, ${unread ? 'unread' : 'read'}`}
    >
      <div className={styles.body}>
        <div className={styles.head}>
          <h3 className={styles.title}>{notification.title}</h3>
          <span className={styles.type}>{typeLabel(notification.type)}</span>
          {isForChild && <span className={styles.childTag}>For {childName as string}</span>}
          <span className={styles.spacer} />
          <span className={styles.time} title={tooltipTime(notification.createdAt)}>
            {unread && <span className={styles.dot} aria-hidden="true" />}
            {relativeTime(notification.createdAt)}
          </span>
        </div>
        <p className={styles.text}>{notification.body}</p>
        <div className={styles.footerActions}>
          {unread && onMarkRead && (
            <button
              type="button"
              className={styles.markRead}
              onClick={() => onMarkRead(notification.id)}
            >
              <span>Mark as read</span>
              <Icon name="arrow-right" size={13} />
            </button>
          )}
          {!unread && onMarkUnread && (
            <button
              type="button"
              className={styles.markUnread}
              onClick={() => onMarkUnread(notification.id)}
            >
              <Icon name="refresh" size={13} />
              <span>Mark as unread</span>
            </button>
          )}
          {isActionableInvitation && (
            <Link to={respondPath} className={styles.markRead}>
              <span>Respond to this invitation</span>
              <Icon name="arrow-right" size={13} />
            </Link>
          )}
          {isPendingTeamManagerInvite && (
            <Link to="/teams" className={styles.markRead}>
              <span>Create your team</span>
              <Icon name="arrow-right" size={13} />
            </Link>
          )}
          {!isActionableInvitation && !isPendingTeamManagerInvite && genericLink && (
            <Link to={genericLink.to} className={styles.markRead}>
              <span>{genericLink.label}</span>
              <Icon name="arrow-right" size={13} />
            </Link>
          )}
          {hasTournamentLink && (
            <Link to={`/tournaments/${tournamentId as string}`} className={styles.markRead}>
              <span>View tournament</span>
              <Icon name="arrow-right" size={13} />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
