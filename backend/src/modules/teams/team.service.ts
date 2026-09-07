import type {
  CreateTeamInput,
  InviteRosterMemberInput,
  MyRosterInvitationDto,
  PendingManagerInviteDto,
  RequestToJoinInput,
  TeamDto,
  UpdateTeamInput,
} from '@nforce/shared';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { TxRunner } from '../../lib/db';
import type { AuditPort } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';
import type { ParentService } from '../parents/parent.service';
import type { ExternalInviteRepoPort } from '../registrations/externalInvite.repo';
import type { RegistrationService } from '../registrations/registration.service';
import type { TournamentInvitationService } from '../registrations/tournamentInvitation.service';
import type { OrganizerTournamentRepoPort } from '../tournaments/organizerTournament.repo';
import type { AuthzService } from '../users-auth/authz.service';
import type { UserRepoPort } from '../users-auth/user.repo';
import type { MyInvitationRow, TeamRepoPort, TeamRow, TeamSearchResult } from './team.repo';

function toDto(row: TeamRow): TeamDto {
  return {
    id: row.id,
    name: row.name,
    managerId: row.managerId,
    managerName: row.managerName,
    roster: row.roster.map((r) => ({
      userId: r.userId,
      name: r.name,
      email: r.email,
      isManagedChild: r.isManagedChild,
      managedByParentName: r.managedByParentName,
      roleInTeam: r.roleInTeam,
      status: r.status,
      joinedAt: r.joinedAt.toISOString(),
    })),
  };
}

function toInvitationDto(row: MyInvitationRow): MyRosterInvitationDto {
  return { teamId: row.teamId, teamName: row.teamName, roleInTeam: row.roleInTeam };
}

export interface TeamServiceDeps {
  teams: TeamRepoPort;
  users: Pick<UserRepoPort, 'findByEmail' | 'findById'>;
  notifications: NotificationService;
  authz: AuthzService;
  audit: AuditPort;
  tx: TxRunner;
  parents: Pick<ParentService, 'assertOwnedMinor'>;
  registrations: Pick<
    RegistrationService,
    'withdrawRedundantIndividualEntries' | 'isTeamRegisteredUnderOrganizer'
  >;
  tournaments: Pick<OrganizerTournamentRepoPort, 'findById'>;
  externalInvites: Pick<
    ExternalInviteRepoPort,
    'findUnconsumedTeamManagerInvites' | 'markTeamInviteFired'
  >;
  tournamentInvitations: Pick<TournamentInvitationService, 'invite'>;
}

export class TeamService {
  constructor(private readonly deps: TeamServiceDeps) {}

  private async assertOwnerOrAdmin(actorId: string, team: TeamRow): Promise<void> {
    if (team.managerId === actorId) return;
    const roles = await this.deps.authz.getRoles(actorId);
    if (!roles.includes('platform_admin')) {
      throw new ForbiddenError('You are not allowed to manage this team', 'NOT_ALLOWED');
    }
  }

  private async assertCanManageRoster(actorId: string, team: TeamRow): Promise<void> {
    if (team.managerId === actorId) return;
    const roles = await this.deps.authz.getRoles(actorId);
    if (roles.includes('platform_admin')) return;
    if (
      roles.includes('organizer') &&
      (await this.deps.registrations.isTeamRegisteredUnderOrganizer(actorId, team.id))
    ) {
      return;
    }
    throw new ForbiddenError('You are not allowed to manage this team', 'NOT_ALLOWED');
  }

  private async getOr404(id: string): Promise<TeamRow> {
    const row = await this.deps.teams.findById(id);
    if (!row) throw new NotFoundError('Team not found');
    return row;
  }

  private async assertNoDuplicateName(
    managerId: string,
    name: string,
    excludeTeamId?: string,
  ): Promise<void> {
    const mine = await this.deps.teams.listByManager(managerId);
    const normalized = name.trim().toLowerCase();
    if (mine.some((t) => t.id !== excludeTeamId && t.name.trim().toLowerCase() === normalized)) {
      throw new ConflictError('You already have a team with this name.', 'DUPLICATE_TEAM_NAME');
    }
  }

  async create(actorId: string, input: CreateTeamInput): Promise<TeamDto> {
    await this.deps.authz.assertRole(actorId, 'team_manager');
    await this.assertNoDuplicateName(actorId, input.name);
    const row = await this.deps.teams.create(actorId, input.name);
    await this.autoInviteFromExternalInvites(actorId, row.id);
    return toDto(row);
  }

  private async autoInviteFromExternalInvites(actorId: string, teamId: string): Promise<void> {
    const pending = await this.deps.externalInvites.findUnconsumedTeamManagerInvites(actorId);
    for (const invite of pending) {
      if (!invite.tournamentId || !invite.tournamentAgeGroupId) continue;
      try {
        await this.deps.tournamentInvitations.invite(
          invite.invitedByOrganizerId,
          invite.tournamentId,
          teamId,
          invite.tournamentAgeGroupId,
        );
      } catch (err) {
        logger.error(
          { err, teamId, externalInviteId: invite.id },
          'Post-team-creation auto-invite follow-up failed',
        );
      } finally {
        await this.deps.externalInvites.markTeamInviteFired(invite.id);
      }
    }
  }

  private async assertOwnsDraftBasedBracket(
    actorId: string,
    tournamentId: string,
    tournamentAgeGroupId: string,
  ): Promise<void> {
    const tournament = await this.deps.tournaments.findById(tournamentId);
    if (!tournament) throw new NotFoundError('Tournament not found');
    if (tournament.organizerId !== actorId) {
      const roles = await this.deps.authz.getRoles(actorId);
      if (!roles.includes('platform_admin')) {
        throw new ForbiddenError('You are not allowed to manage this tournament', 'NOT_ALLOWED');
      }
    }
    if (tournament.teamSelectionMode !== 'draft_based') {
      throw new ConflictError(
        'Draft teams only apply to a draft-based tournament.',
        'NOT_DRAFT_BASED',
      );
    }
    if (!tournament.ageGroups.some((g) => g.id === tournamentAgeGroupId)) {
      throw new NotFoundError('Age group not found for this tournament', 'AGE_GROUP_NOT_FOUND');
    }
  }

  async createDraftTeam(
    actorId: string,
    tournamentId: string,
    tournamentAgeGroupId: string,
    name: string,
  ): Promise<TeamDto> {
    await this.assertOwnsDraftBasedBracket(actorId, tournamentId, tournamentAgeGroupId);
    await this.assertNoDuplicateDraftTeamName(tournamentAgeGroupId, name);
    const row = await this.deps.teams.createDraft(actorId, name, tournamentAgeGroupId);
    return toDto(row);
  }

  private async assertNoDuplicateDraftTeamName(
    tournamentAgeGroupId: string,
    name: string,
  ): Promise<void> {
    const siblings = await this.deps.teams.listDraftTeamsForAgeGroup(tournamentAgeGroupId);
    const normalized = name.trim().toLowerCase();
    if (siblings.some((t) => t.name.trim().toLowerCase() === normalized)) {
      throw new ConflictError('You already have a team with this name.', 'DUPLICATE_TEAM_NAME');
    }
  }

  async listDraftTeams(
    actorId: string,
    tournamentId: string,
    tournamentAgeGroupId: string,
  ): Promise<TeamDto[]> {
    await this.assertOwnsDraftBasedBracket(actorId, tournamentId, tournamentAgeGroupId);
    const rows = await this.deps.teams.listDraftTeamsForAgeGroup(tournamentAgeGroupId);
    return rows.map(toDto);
  }

  async assignDraftPlayer(actorId: string, teamId: string, userId: string): Promise<TeamDto> {
    const team = await this.getOr404(teamId);
    await this.assertOwnerOrAdmin(actorId, team);
    if (!team.draftTournamentAgeGroupId) {
      throw new ConflictError(
        'Only a draft team can have players assigned directly.',
        'NOT_DRAFT_TEAM',
      );
    }
    if (team.roster.some((r) => r.userId === userId)) {
      return toDto(team);
    }
    const siblings = await this.deps.teams.listDraftTeamsForAgeGroup(
      team.draftTournamentAgeGroupId,
    );
    for (const sibling of siblings) {
      if (sibling.id !== teamId && sibling.roster.some((r) => r.userId === userId)) {
        await this.deps.teams.removeRosterEntry(sibling.id, userId);
      }
    }
    await this.deps.teams.addAcceptedRosterEntry(teamId, userId, 'player');
    await this.deps.notifications.notify({
      userId,
      type: 'squad_assigned',
      title: `You've been placed on ${team.name}`,
      body: `You've been assigned to ${team.name} for the draft.`,
      payload: { teamId },
    });
    return toDto(await this.getOr404(teamId));
  }

  async listMine(actorId: string): Promise<TeamDto[]> {
    await this.deps.authz.assertRole(actorId, 'team_manager');
    const rows = await this.deps.teams.listByManager(actorId);
    return rows.map(toDto);
  }

  search(query: string): Promise<TeamSearchResult[]> {
    return this.deps.teams.searchByName(query);
  }

  async getOwned(actorId: string, id: string): Promise<TeamDto> {
    const row = await this.getOr404(id);
    await this.assertOwnerOrAdmin(actorId, row);
    return toDto(row);
  }

  async update(actorId: string, id: string, input: UpdateTeamInput, ip?: string): Promise<TeamDto> {
    const existing = await this.getOr404(id);
    await this.assertOwnerOrAdmin(actorId, existing);
    await this.assertNoDuplicateName(existing.managerId, input.name, id);
    const row = await this.deps.teams.update(id, input.name);
    if (existing.name !== input.name) {
      await this.deps.audit.write({
        action: 'team.renamed',
        actorUserId: actorId,
        entityType: 'team',
        entityId: id,
        meta: { name: input.name, previousName: existing.name },
        ip,
      });
    }
    return toDto(row);
  }

  async inviteMember(
    actorId: string,
    teamId: string,
    input: InviteRosterMemberInput,
  ): Promise<TeamDto> {
    const team = await this.getOr404(teamId);
    await this.assertCanManageRoster(actorId, team);

    const invitee = input.userId
      ? await this.deps.users.findById(input.userId)
      : await this.deps.users.findByEmail(input.email!);
    if (!invitee) {
      throw new NotFoundError('No account exists with that email address', 'USER_NOT_FOUND');
    }
    const existingEntry = team.roster.find((r) => r.userId === invitee.id);
    if (existingEntry && existingEntry.status !== 'declined') {
      throw new ConflictError('This player is already on the roster.', 'ALREADY_ON_ROSTER');
    }

    await this.deps.teams.addRosterEntry(teamId, invitee.id, input.roleInTeam);
    await this.deps.notifications.notify({
      userId: invitee.id,
      type: 'squad_invitation',
      title: `Squad invitation: ${team.name}`,
      body: `${team.managerName} invited you to join ${team.name} as ${input.roleInTeam}.`,
      payload: { teamId },
    });

    return toDto(await this.getOr404(teamId));
  }

  async myPendingManagerInvites(actorId: string): Promise<PendingManagerInviteDto[]> {
    const rows = await this.deps.externalInvites.findUnconsumedTeamManagerInvites(actorId);
    const result: PendingManagerInviteDto[] = [];
    for (const row of rows) {
      if (!row.tournamentId) continue;
      const organizer = await this.deps.users.findById(row.invitedByOrganizerId);
      result.push({
        tournamentId: row.tournamentId,
        tournamentName: row.tournamentName ?? 'a tournament',
        organizerName: organizer?.name ?? 'The organizer',
      });
    }
    return result;
  }

  async requestToJoin(actorId: string, teamId: string, input: RequestToJoinInput): Promise<void> {
    await this.deps.authz.assertRole(actorId, 'player');
    const team = await this.getOr404(teamId);
    const requester = await this.deps.users.findById(actorId);
    await this.deps.teams.requestToJoin(teamId, actorId, input.roleInTeam);
    await this.deps.notifications.notify({
      userId: team.managerId,
      type: 'squad_join_request',
      title: `Join request: ${team.name}`,
      body: `${requester?.name ?? 'A player'} asked to join ${team.name} as ${input.roleInTeam}.`,
      payload: { teamId },
    });
  }

  async myInvitations(actorId: string): Promise<MyRosterInvitationDto[]> {
    const rows = await this.deps.teams.listInvitationsForUser(actorId);
    return rows.map(toInvitationDto);
  }

  async myInvitationsForChild(parentId: string, childId: string): Promise<MyRosterInvitationDto[]> {
    await this.deps.authz.assertRole(parentId, 'parent');
    await this.deps.parents.assertOwnedMinor(parentId, childId);
    const rows = await this.deps.teams.listInvitationsForUser(childId);
    return rows.map(toInvitationDto);
  }

  async respondToInvite(
    actorId: string,
    teamId: string,
    decision: 'accept' | 'decline',
  ): Promise<void> {
    const entry = await this.deps.teams.findRosterEntry(teamId, actorId);
    if (!entry || entry.status !== 'invited') {
      throw new NotFoundError('No pending invitation found for this team');
    }
    await this.deps.teams.setRosterStatus(
      teamId,
      actorId,
      decision === 'accept' ? 'accepted' : 'declined',
    );
    if (decision === 'accept') {
      await this.deps.registrations.withdrawRedundantIndividualEntries(actorId, actorId, teamId);
    }
    const team = await this.getOr404(teamId);
    const player = await this.deps.users.findById(actorId);
    await this.deps.notifications.notify({
      userId: team.managerId,
      type: 'squad_invitation_response',
      title: `${team.name}`,
      body:
        decision === 'accept'
          ? `${player?.name ?? 'A player'} accepted your invitation to join ${team.name}.`
          : `${player?.name ?? 'A player'} declined your invitation to join ${team.name}.`,
      payload: { teamId, userId: actorId },
    });
  }

  async respondToInviteForChild(
    parentId: string,
    childId: string,
    teamId: string,
    decision: 'accept' | 'decline',
    ip?: string,
  ): Promise<void> {
    await this.deps.authz.assertRole(parentId, 'parent');
    const child = await this.deps.parents.assertOwnedMinor(parentId, childId);

    const entry = await this.deps.teams.findRosterEntry(teamId, childId);
    if (!entry || entry.status !== 'invited') {
      throw new NotFoundError('No pending invitation found for this team');
    }
    const team = await this.getOr404(teamId);

    await this.deps.tx.run(async (db) => {
      await this.deps.teams.setRosterStatus(
        teamId,
        childId,
        decision === 'accept' ? 'accepted' : 'declined',
        db,
      );
      await this.deps.audit.write(
        {
          action: 'team.invitation_responded',
          actorUserId: parentId,
          entityType: 'user',
          entityId: childId,
          meta: { teamId, decision, onBehalfOf: childId },
          ip,
        },
        db,
      );
    });
    if (decision === 'accept') {
      await this.deps.registrations.withdrawRedundantIndividualEntries(
        parentId,
        childId,
        teamId,
        ip,
      );
    }

    await this.deps.notifications.notify({
      userId: team.managerId,
      type: 'squad_invitation_response',
      title: `${team.name}`,
      body:
        decision === 'accept'
          ? `${child.name} accepted your invitation to join ${team.name}.`
          : `${child.name} declined your invitation to join ${team.name}.`,
      payload: { teamId, userId: childId, respondedByParentId: parentId },
    });
  }

  async respondToJoinRequest(
    actorId: string,
    teamId: string,
    userId: string,
    decision: 'accept' | 'decline',
    ip?: string,
  ): Promise<void> {
    const team = await this.getOr404(teamId);
    await this.assertOwnerOrAdmin(actorId, team);
    const entry = await this.deps.teams.findRosterEntry(teamId, userId);
    if (!entry || entry.status !== 'requested') {
      throw new NotFoundError('No pending join request found for this player');
    }
    if (decision === 'decline') {
      await this.deps.tx.run(async (db) => {
        await this.deps.teams.setRosterStatus(teamId, userId, 'declined', db);
        await this.deps.audit.write(
          {
            action: 'team.join_request_declined',
            actorUserId: actorId,
            entityType: 'user',
            entityId: userId,
            meta: { teamId },
            ip,
          },
          db,
        );
      });
    } else {
      await this.deps.teams.setRosterStatus(teamId, userId, 'accepted');
      await this.deps.registrations.withdrawRedundantIndividualEntries(actorId, userId, teamId, ip);
    }
    await this.deps.notifications.notify({
      userId,
      type: 'squad_join_response',
      title: `${team.name}`,
      body:
        decision === 'accept'
          ? `Your request to join ${team.name} was accepted.`
          : `Your request to join ${team.name} was declined.`,
      payload: { teamId },
    });
  }

  async removeMember(actorId: string, teamId: string, userId: string, ip?: string): Promise<void> {
    const team = await this.getOr404(teamId);
    await this.assertCanManageRoster(actorId, team);
    await this.deps.tx.run(async (db) => {
      await this.deps.teams.removeRosterEntry(teamId, userId, db);
      await this.deps.audit.write(
        {
          action: 'team.member_removed',
          actorUserId: actorId,
          entityType: 'user',
          entityId: userId,
          meta: { teamId },
          ip,
        },
        db,
      );
    });
    await this.deps.notifications.notify({
      userId,
      type: 'squad_removed',
      title: `Removed from ${team.name}`,
      body: `You have been removed from ${team.name}'s roster.`,
      payload: { teamId },
    });
  }
}
