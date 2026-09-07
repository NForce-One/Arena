import type {
  ExternalInviteDto,
  ExternalInvitePreviewDto,
  ExternalInviteRole,
  SendExternalInviteResultDto,
} from '@nforce/shared';
import { TOURNAMENT_GENDER_CATEGORY_LABELS, TOURNAMENT_STRUCTURE_LABELS } from '@nforce/shared';
import { logger } from '../../lib/logger';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { tokenErrorFrom } from '../../lib/tokenErrors';
import type { EmailAdapter } from '../../adapters/email/EmailAdapter';
import type { AuditPort } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';
import type { OrganizerTournamentRepoPort } from '../tournaments/organizerTournament.repo';
import type { AuthzService } from '../users-auth/authz.service';
import { ROLE_IDS } from '../users-auth/roles';
import type { TokenServicePort } from '../users-auth/token.service';
import type { UserRepoPort } from '../users-auth/user.repo';
import type { ExternalInviteRepoPort, ExternalInviteRow } from './externalInvite.repo';
import type { TournamentInvitationService } from './tournamentInvitation.service';

const EXTERNAL_INVITE_TTL_DAYS = 7;

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatDateRange(start: Date, end: Date): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function toDto(row: ExternalInviteRow): ExternalInviteDto {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    tournamentId: row.tournamentId,
    tournamentName: row.tournamentName,
    tournamentAgeGroupId: row.tournamentAgeGroupId,
    ageGroupLabel: row.ageGroupLabel,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface ExternalInviteServiceDeps {
  invites: ExternalInviteRepoPort;
  tournaments: Pick<OrganizerTournamentRepoPort, 'findById'>;
  users: Pick<UserRepoPort, 'findByEmail' | 'findById' | 'addRole'>;
  authz: AuthzService;
  tournamentInvitations: Pick<TournamentInvitationService, 'invitePlayer'>;
  notifications: Pick<NotificationService, 'notify'>;
  email: EmailAdapter;
  tokens: Pick<TokenServicePort, 'generateOpaqueToken' | 'hashToken'>;
  audit: AuditPort;
  config: { webOrigin: string };
}

export class ExternalInviteService {
  constructor(private readonly deps: ExternalInviteServiceDeps) {}

  private async assertOrganizerOrAdmin(actorId: string, organizerId: string): Promise<void> {
    if (organizerId === actorId) return;
    const roles = await this.deps.authz.getRoles(actorId);
    if (!roles.includes('platform_admin')) {
      throw new ForbiddenError('You are not allowed to manage this tournament', 'NOT_ALLOWED');
    }
  }

  async send(
    actorId: string,
    tournamentId: string,
    role: ExternalInviteRole,
    email: string,
    tournamentAgeGroupId: string,
  ): Promise<SendExternalInviteResultDto> {
    const tournament = await this.deps.tournaments.findById(tournamentId);
    if (!tournament) throw new NotFoundError('Tournament not found');
    await this.assertOrganizerOrAdmin(actorId, tournament.organizerId);

    if (!tournament.ageGroups.some((g) => g.id === tournamentAgeGroupId)) {
      throw new NotFoundError('Age group not found for this tournament', 'AGE_GROUP_NOT_FOUND');
    }
    if (tournament.status !== 'published') {
      throw new ConflictError(
        `Only a published tournament can invite ${role === 'player' ? 'players' : 'team managers'}.`,
        'TOURNAMENT_NOT_PUBLISHED',
      );
    }
    const bracketId = tournamentAgeGroupId;

    const existing = await this.deps.users.findByEmail(email);
    if (existing) {
      if (role === 'player') {
        const roles = await this.deps.authz.getRoles(existing.id);
        if (!roles.includes('player')) {
          await this.deps.users.addRole(existing.id, ROLE_IDS.player);
        }
        await this.deps.tournamentInvitations.invitePlayer(
          actorId,
          tournamentId,
          existing.id,
          bracketId,
          false,
        );
        return { outcome: 'invited_directly', name: existing.name };
      }
      const roles = await this.deps.authz.getRoles(existing.id);
      if (!roles.includes('team_manager')) {
        await this.deps.users.addRole(existing.id, ROLE_IDS.team_manager);
        await this.deps.audit.write({
          action: 'external_invite.access_granted',
          actorUserId: actorId,
          entityType: 'user',
          entityId: existing.id,
          meta: { role: 'team_manager' },
        });
      }
      const alreadyQueued = (
        await this.deps.invites.findUnconsumedTeamManagerInvites(existing.id)
      ).some((inv) => inv.tournamentId === tournamentId && inv.tournamentAgeGroupId === bracketId);
      if (!alreadyQueued) {
        const token = this.deps.tokens.generateOpaqueToken();
        await this.deps.invites.create({
          email,
          role,
          tournamentId,
          tournamentAgeGroupId: bracketId,
          invitedByOrganizerId: actorId,
          tokenHash: token.hash,
          expiresAt: new Date(Date.now() + EXTERNAL_INVITE_TTL_DAYS * 86_400_000),
          status: 'fulfilled',
          claimedByUserId: existing.id,
        });
        const organizer = await this.deps.users.findById(actorId);
        await this.deps.notifications.notify({
          userId: existing.id,
          type: 'team_manager_invite_pending',
          title: "You've been invited to manage a team",
          body: `${organizer?.name ?? 'The organizer'} invited you to manage a team for ${tournament.name}. Create a team to see your invitation.`,
          payload: { tournamentId },
        });
      }
      return { outcome: 'access_granted', name: existing.name };
    }

    const pending = await this.deps.invites.findPending(email, role, bracketId);
    const token = this.deps.tokens.generateOpaqueToken();
    const expiresAt = new Date(Date.now() + EXTERNAL_INVITE_TTL_DAYS * 86_400_000);
    const row = pending
      ? await this.deps.invites.reissue(pending.id, { tokenHash: token.hash, expiresAt })
      : await this.deps.invites.create({
          email,
          role,
          tournamentId,
          tournamentAgeGroupId: bracketId,
          invitedByOrganizerId: actorId,
          tokenHash: token.hash,
          expiresAt,
        });

    await this.deps.audit.write({
      action: 'external_invite.sent',
      actorUserId: actorId,
      entityType: 'external_invite',
      entityId: row.id,
      meta: { email, role },
    });

    try {
      const organizer = await this.deps.users.findById(actorId);
      const bracket = tournament.ageGroups.find((g) => g.id === bracketId)!;
      const location = [tournament.locationCity, tournament.locationState]
        .filter((v): v is string => !!v)
        .join(', ');
      await this.deps.email.sendExternalInviteEmail({
        to: email,
        role,
        organizerName: organizer?.name ?? 'The organizer',
        organizerAcademyName: organizer?.academyName ?? null,
        signupUrl: `${this.deps.config.webOrigin}/signup?inviteToken=${token.raw}`,
        tournament: {
          name: tournament.name,
          structureLabel: TOURNAMENT_STRUCTURE_LABELS[tournament.structure],
          ageGroupLabel: `${bracket.name} · ${TOURNAMENT_GENDER_CATEGORY_LABELS[bracket.genderCategory]}`,
          formatLabel: bracket.format,
          dateRange: formatDateRange(tournament.startDate, tournament.endDate),
          location: location || null,
          entryFee: bracket.entryFee,
        },
      });
    } catch (err) {
      logger.error({ err, email, role }, 'External invite email failed to send');
    }

    return { outcome: 'invited_by_email' };
  }

  async getByToken(rawToken: string): Promise<ExternalInvitePreviewDto> {
    const row = await this.deps.invites.findByTokenHash(this.deps.tokens.hashToken(rawToken));
    if (!row) throw tokenErrorFrom({ outcome: 'invalid' });
    if (row.status === 'fulfilled') throw tokenErrorFrom({ outcome: 'used' });
    if (row.expiresAt.getTime() <= Date.now()) throw tokenErrorFrom({ outcome: 'expired' });
    const organizer = await this.deps.users.findById(row.invitedByOrganizerId);
    return {
      email: row.email,
      role: row.role,
      organizerName: organizer?.name ?? 'The organizer',
      tournamentName: row.tournamentName,
      ageGroupLabel: row.ageGroupLabel,
    };
  }

  async listForTournament(actorId: string, tournamentId: string): Promise<ExternalInviteDto[]> {
    const tournament = await this.deps.tournaments.findById(tournamentId);
    if (!tournament) throw new NotFoundError('Tournament not found');
    await this.assertOrganizerOrAdmin(actorId, tournament.organizerId);
    const rows = await this.deps.invites.listForTournament(tournamentId);
    return rows.map(toDto);
  }
}
