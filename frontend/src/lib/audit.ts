import type { AuditEntryDto, PaymentStatusValue } from '@nforce/shared';
import { PAYMENT_STATUS_LABELS } from '@nforce/shared';

export function humanRole(role: string): string {
  const s = role.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function str(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === 'string' && v ? v : null;
}

function num(meta: Record<string, unknown>, key: string): number | null {
  const v = meta[key];
  return typeof v === 'number' ? v : null;
}

function paymentLabel(meta: Record<string, unknown>, statusKey: string, amountKey: string): string {
  const status = str(meta, statusKey) as PaymentStatusValue | null;
  if (!status) return 'unknown';
  const label = PAYMENT_STATUS_LABELS[status] ?? status;
  const amount = num(meta, amountKey);
  return status === 'partial' && amount != null ? `${label} (${amount})` : label;
}

export function describeAudit(e: AuditEntryDto): { summary: string; detail: string | null } {
  const meta =
    e.meta && typeof e.meta === 'object' && !Array.isArray(e.meta)
      ? (e.meta as Record<string, unknown>)
      : {};

  const name = e.entityLabel ?? str(meta, 'name');

  const phrase = (verb: string, noun: string): string => {
    if (name) return `${verb} the ${noun} “${name}”`;
    return `${verb} ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
  };
  const tournament = e.metaLabels.tournamentId;
  const inTournament = tournament ? ` in “${tournament}”` : '';

  switch (e.action) {
    case 'tournament.created':
      return { summary: phrase('Created', 'tournament'), detail: null };
    case 'tournament.published':
      return { summary: phrase('Published', 'tournament'), detail: 'Now visible publicly' };
    case 'tournament.closed':
      return {
        summary: name ? `Closed registration for “${name}”` : 'Closed registration',
        detail: null,
      };
    case 'tournament.updated': {
      const fields = meta['changedFields'];
      const fieldList = Array.isArray(fields)
        ? fields.filter((f): f is string => typeof f === 'string')
        : [];
      return {
        summary: phrase('Edited', 'tournament'),
        detail: fieldList.length > 0 ? `Changed ${fieldList.join(', ')}` : null,
      };
    }
    case 'tournament.deleted':
      return {
        summary: phrase('Deleted', 'tournament'),
        detail: 'Its teams, matches and results were removed too',
      };
    case 'tournament.rules_document_deleted':
      return { summary: phrase('Removed the rules document from', 'tournament'), detail: null };

    case 'fixture.scheduled':
      return { summary: `Scheduled a match${inTournament}`, detail: e.entityLabel };
    case 'fixture.rescheduled': {
      const previousStartsAt = str(meta, 'previousStartsAt');
      const startsAt = str(meta, 'startsAt');
      const groundChanged = meta['groundChanged'] === true;
      const timeChange =
        previousStartsAt && startsAt
          ? `${absoluteTime(previousStartsAt)} → ${absoluteTime(startsAt)}`
          : null;
      return {
        summary: `Changed the time of a match${inTournament}`,
        detail: [
          timeChange,
          groundChanged ? 'ground changed' : null,
          'a fresh ground booking was requested',
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }

    case 'booking.confirmed':
      return { summary: 'Confirmed a ground booking', detail: null };
    case 'booking.declined':
      return { summary: 'Declined a ground booking', detail: 'The match lost its ground' };
    case 'booking.cancelled':
      return { summary: 'Cancelled a ground booking', detail: 'The match lost its ground' };

    case 'registration.withdrawn':
      return {
        summary: name
          ? `${name} withdrew${inTournament}`
          : `A registration was withdrawn${inTournament}`,
        detail: null,
      };
    case 'registration.created':
      return {
        summary: name ? `Registered ${name}${inTournament}` : `Registered a player${inTournament}`,
        detail: null,
      };
    case 'registration.payment_updated': {
      const from = paymentLabel(meta, 'previousStatus', 'previousAmountPaid');
      const to = paymentLabel(meta, 'status', 'amountPaid');
      return {
        summary: name
          ? `Updated ${name}'s payment${inTournament}`
          : `Updated a player's payment${inTournament}`,
        detail: `${from} → ${to}`,
      };
    }

    case 'team.member_removed': {
      const team = e.metaLabels.teamId;
      return {
        summary: name
          ? `Removed ${name} from${team ? ` “${team}”'s` : ' the'} roster`
          : 'Removed a player from a roster',
        detail: null,
      };
    }
    case 'team.invitation_responded': {
      const team = e.metaLabels.teamId;
      const decision = str(meta, 'decision');
      const verb = decision === 'accept' ? 'Accepted' : 'Declined';
      return {
        summary: name
          ? `${verb} ${team ? `“${team}”'s` : 'a'} invitation for ${name}`
          : `${verb} a squad invitation`,
        detail: null,
      };
    }
    case 'team.join_request_declined': {
      const team = e.metaLabels.teamId;
      return {
        summary: name
          ? `Declined ${name}'s request to join${team ? ` “${team}”` : ''}`
          : 'Declined a request to join a team',
        detail: null,
      };
    }
    case 'team.renamed': {
      const previousName = str(meta, 'previousName');
      return {
        summary: name ? `Renamed a team to “${name}”` : 'Renamed a team',
        detail: previousName ? `Was “${previousName}”` : null,
      };
    }

    case 'ground.created':
      return { summary: phrase('Listed', 'ground'), detail: null };
    case 'ground.updated': {
      const fields = meta['changedFields'];
      const fieldList = Array.isArray(fields)
        ? fields.filter((f): f is string => typeof f === 'string')
        : [];
      const previousName = str(meta, 'previousName');
      return {
        summary: phrase('Edited', 'ground'),
        detail:
          previousName && name
            ? `Renamed from “${previousName}”${fieldList.length > 1 ? ` · also changed ${fieldList.filter((f) => f !== 'name').join(', ')}` : ''}`
            : fieldList.length > 0
              ? `Changed ${fieldList.join(', ')}`
              : null,
      };
    }
    case 'ground.deleted':
      return { summary: phrase('Deleted', 'ground'), detail: null };

    case 'age_group.created':
      return { summary: phrase('Added', 'age group'), detail: null };
    case 'age_group.updated':
      return { summary: phrase('Edited', 'age group'), detail: null };
    case 'age_group.deleted':
      return { summary: phrase('Removed', 'age group'), detail: null };

    case 'announcement.published': {
      const title = str(meta, 'title');
      const targets = meta['targetRoles'];
      const roleList = Array.isArray(targets)
        ? targets.filter((r): r is string => typeof r === 'string')
        : [];
      return {
        summary: title ? `Published the announcement “${title}”` : 'Published an announcement',
        detail:
          roleList.length > 0
            ? `Sent to ${roleList.map((r) => `${humanRole(r)}s`).join(', ')}`
            : 'Sent to everyone',
      };
    }

    case 'result.entered': {
      const winner = e.metaLabels.winnerTeamId;
      const homeScore = str(meta, 'homeScore');
      const awayScore = str(meta, 'awayScore');
      const score = homeScore && awayScore ? `${homeScore} – ${awayScore}` : null;
      const outcome = winner ? `${winner} won` : 'Recorded as a draw';
      const isCorrection = meta['isCorrection'] === true;
      if (isCorrection) {
        const prevHome = str(meta, 'previousHomeScore');
        const prevAway = str(meta, 'previousAwayScore');
        const prevWinner = e.metaLabels.previousWinnerTeamId;
        const prevScore = prevHome && prevAway ? `${prevHome} – ${prevAway}` : null;
        const prevOutcome = prevScore ? ` (${prevWinner ? `${prevWinner} won` : 'draw'})` : '';
        return {
          summary: `Corrected a match result${inTournament}`,
          detail: `${prevScore ?? '?'}${prevOutcome} → ${score ?? '?'} (${outcome})`,
        };
      }
      return {
        summary: `Entered a match result${inTournament}`,
        detail: score ? `${score} · ${outcome}` : outcome,
      };
    }

    case 'umpire.assigned': {
      const umpire = e.metaLabels.umpireId;
      return {
        summary: umpire ? `Assigned ${umpire} as umpire` : 'Assigned an umpire to a match',
        detail: e.entityLabel,
      };
    }

    case 'role.self_granted': {
      const role = str(meta, 'role');
      return {
        summary: `Enabled the ${role ? humanRole(role) : 'new'} role on their own account`,
        detail: null,
      };
    }

    case 'child.added':
      return { summary: phrase('Added', 'child'), detail: 'A managed player profile' };
    case 'child.updated': {
      const field = str(meta, 'field');
      const change = str(meta, 'change');
      return {
        summary: phrase('Edited', "child's profile"),
        detail: field && change ? `${field[0]!.toUpperCase()}${field.slice(1)} ${change}` : null,
      };
    }
    case 'child.claim_invited':
      return {
        summary: name
          ? `Invited ${name} to set up their own login`
          : 'Sent an account-claim invite',
        detail: null,
      };
    case 'child.claimed_account':
      return {
        summary: name ? `${name} claimed their own account` : 'A managed account was claimed',
        detail: 'No longer parent-managed',
      };

    case 'contact.resolved': {
      const subject = str(meta, 'subject');
      return {
        summary: subject ? `Resolved the message “${subject}”` : 'Resolved a contact message',
        detail: null,
      };
    }

    case 'role.granted': {
      const role = str(meta, 'role');
      return {
        summary: `Gave ${name ?? 'a user'} the ${role ? humanRole(role) : 'new'} role`,
        detail: null,
      };
    }
    case 'role.revoked': {
      const role = str(meta, 'role');
      return {
        summary: `Removed the ${role ? humanRole(role) : ''} role from ${name ?? 'a user'}`.replace(
          /\s+/g,
          ' ',
        ),
        detail: null,
      };
    }

    case 'user.verification_requested':
      return { summary: `Re-sent the verification email to ${name ?? 'a user'}`, detail: null };

    case 'auth.signup':
      return { summary: 'Created an account', detail: null };
    case 'auth.password_reset':
      return { summary: 'Reset their password', detail: 'All other sessions were signed out' };
    case 'auth.refresh_reuse_detected':
      return {
        summary: 'An already-used sign-in token was presented',
        detail: 'Every session for this account was signed out as a precaution',
      };

    default: {
      const words = e.action.replace(/[._]/g, ' ');
      return { summary: words.charAt(0).toUpperCase() + words.slice(1), detail: name };
    }
  }
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function isSecurityAction(action: string): boolean {
  return action === 'auth.refresh_reuse_detected' || action.startsWith('role.');
}
