import type { TournamentInvitationDto } from '@nforce/shared';
import { registrationWindowStatus } from '../../lib/age';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import type { NotificationService } from '../notifications/notification.service';
import type { ParentService } from '../parents/parent.service';
import type { TeamRepoPort } from '../teams/team.repo';
import type { OrganizerTournamentRepoPort } from '../tournaments/organizerTournament.repo';
import type { AuthzService } from '../users-auth/authz.service';
import type { UserRepoPort } from '../users-auth/user.repo';
import type { RegistrationService } from './registration.service';
import type {
  TournamentInvitationRepoPort,
  TournamentInvitationRow,
} from './tournamentInvitation.repo';

function toDto(row: TournamentInvitationRow): TournamentInvitationDto {
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    tournamentName: row.tournamentName,
    entityType: row.entityType,
    entityId: row.entityId,
    entityName: row.entityName,
    tournamentAgeGroupId: row.tournamentAgeGroupId,
    ageGroupLabel: row.ageGroupLabel,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    capacityOverridden: row.capacityOverridden,
  };
}

export interface TournamentInvitationServiceDeps {
  invitations: TournamentInvitationRepoPort;
  teams: Pick<TeamRepoPort, 'findById'>;
  users: Pick<UserRepoPort, 'findById'>;
  tournaments: Pick<OrganizerTournamentRepoPort, 'findById'>;
  registrations: RegistrationService;
  notifications: NotificationService;
  authz: AuthzService;
  parents: Pick<ParentService, 'assertOwnedMinor'>;
}

export class TournamentInvitationService {
  constructor(private readonly deps: TournamentInvitationServiceDeps) {}

  private async assertOrganizerOrAdmin(actorId: string, organizerId: string): Promise<void> {
    if (organizerId === actorId) return;
    const roles = await this.deps.authz.getRoles(actorId);
    if (!roles.includes('platform_admin')) {
      throw new ForbiddenError('You are not allowed to manage this tournament', 'NOT_ALLOWED');
    }
  }

  async invite(
    actorId: string,
    tournamentId: string,
    teamId: string,
    tournamentAgeGroupId: string,
    overrideRegistrationWindow = false,
    overrideEligibility = false,
    overrideCapacity = false,
  ): Promise<TournamentInvitationDto> {
    const tournament = await this.deps.tournaments.findById(tournamentId);
    if (!tournament) throw new NotFoundError('Tournament not found');
    await this.assertOrganizerOrAdmin(actorId, tournament.organizerId);
    if (tournament.status !== 'published') {
      throw new ConflictError(
        'Only a published tournament can invite teams.',
        'TOURNAMENT_NOT_PUBLISHED',
      );
    }
    if (tournament.teamSelectionMode === 'draft_based') {
      throw new ConflictError(
        'This tournament is draft-based, so players register individually and teams cannot be invited.',
        'TEAM_INVITE_NOT_ALLOWED',
      );
    }
    const bracket = tournament.ageGroups.find((g) => g.id === tournamentAgeGroupId);
    if (!bracket) {
      throw new NotFoundError('Age group not found for this tournament', 'AGE_GROUP_NOT_FOUND');
    }
    if (!overrideRegistrationWindow) {
      const windowStatus = registrationWindowStatus(bracket);
      if (!windowStatus.open) {
        throw new ConflictError(
          windowStatus.message,
          windowStatus.notYetOpen ? 'REGISTRATION_NOT_YET_OPEN' : 'REGISTRATION_WINDOW_CLOSED',
        );
      }
    }
    let capacityOverriddenFlag = false;
    if (bracket.capacity != null && bracket.registeredCount >= bracket.capacity) {
      if (!overrideCapacity) {
        throw new ConflictError('This category is already full.', 'TOURNAMENT_FULL');
      }
      capacityOverriddenFlag = true;
    }
    const team = await this.deps.teams.findById(teamId);
    if (!team) throw new NotFoundError('Team not found');

    let eligibilityOverridden = false;
    const accepted = team.roster.filter((r) => r.status === 'accepted');
    for (const member of accepted) {
      const user = await this.deps.users.findById(member.userId);
      if (!user) continue;
      try {
        this.deps.registrations.assertEligibility(user, member.name, bracket, false);
      } catch (err) {
        if (!(err instanceof ConflictError)) throw err;
        if (!overrideEligibility) throw err;
        eligibilityOverridden = true;
        break;
      }
    }

    const row = await this.deps.invitations.createForTeam(
      tournamentId,
      teamId,
      tournamentAgeGroupId,
      actorId,
      overrideRegistrationWindow,
      eligibilityOverridden,
      capacityOverriddenFlag,
    );
    await this.deps.notifications.notify({
      userId: team.managerId,
      type: 'tournament_invitation',
      title: `Tournament invitation: ${tournament.name}`,
      body: `Your team ${team.name} has been invited to ${tournament.name}.`,
      payload: { tournamentId, teamId },
    });
    return toDto(row);
  }

  async invitePlayer(
    actorId: string,
    tournamentId: string,
    userId: string,
    tournamentAgeGroupId: string,
    overrideEligibility: boolean,
    overrideRegistrationWindow = false,
    overrideCapacity = false,
  ): Promise<TournamentInvitationDto> {
    const tournament = await this.deps.tournaments.findById(tournamentId);
    if (!tournament) throw new NotFoundError('Tournament not found');
    await this.assertOrganizerOrAdmin(actorId, tournament.organizerId);
    if (tournament.status !== 'published') {
      throw new ConflictError(
        'Only a published tournament can invite players.',
        'TOURNAMENT_NOT_PUBLISHED',
      );
    }
    const bracket = tournament.ageGroups.find((g) => g.id === tournamentAgeGroupId);
    if (!bracket) {
      throw new NotFoundError('Age group not found for this tournament', 'AGE_GROUP_NOT_FOUND');
    }
    if (!overrideRegistrationWindow) {
      const windowStatus = registrationWindowStatus(bracket);
      if (!windowStatus.open) {
        throw new ConflictError(
          windowStatus.message,
          windowStatus.notYetOpen ? 'REGISTRATION_NOT_YET_OPEN' : 'REGISTRATION_WINDOW_CLOSED',
        );
      }
    }
    const player = await this.deps.users.findById(userId);
    if (!player) throw new NotFoundError('Player not found');
    const roles = await this.deps.authz.getRoles(userId);
    if (!roles.includes('player')) throw new NotFoundError('Player not found');

    let eligibilityOverridden = false;
    try {
      this.deps.registrations.assertEligibility(player, player.name, bracket, false);
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      if (!overrideEligibility) throw err;
      eligibilityOverridden = true;
    }

    let capacityOverriddenFlag = false;
    if (
      tournament.teamSelectionMode === 'draft_based' &&
      bracket.capacity != null &&
      bracket.registeredCount >= bracket.capacity
    ) {
      if (!overrideCapacity) {
        throw new ConflictError('This category is already full.', 'TOURNAMENT_FULL');
      }
      capacityOverriddenFlag = true;
    }

    const row = await this.deps.invitations.createForUser(
      tournamentId,
      userId,
      tournamentAgeGroupId,
      actorId,
      eligibilityOverridden,
      overrideRegistrationWindow,
      capacityOverriddenFlag,
    );
    await this.deps.notifications.notify({
      userId,
      type: 'tournament_invitation',
      title: `Tournament invitation: ${tournament.name}`,
      body: `You've been invited to register for ${tournament.name}.`,
      payload: { tournamentId, invitationId: row.id },
    });
    return toDto(row);
  }

  async listForTournament(
    actorId: string,
    tournamentId: string,
  ): Promise<TournamentInvitationDto[]> {
    const tournament = await this.deps.tournaments.findById(tournamentId);
    if (!tournament) throw new NotFoundError('Tournament not found');
    await this.assertOrganizerOrAdmin(actorId, tournament.organizerId);
    const rows = await this.deps.invitations.listForTournament(tournamentId);
    return rows.map(toDto);
  }

  async listForTeam(actorId: string, teamId: string): Promise<TournamentInvitationDto[]> {
    const team = await this.deps.teams.findById(teamId);
    if (!team) throw new NotFoundError('Team not found');
    if (team.managerId !== actorId) {
      const roles = await this.deps.authz.getRoles(actorId);
      if (!roles.includes('platform_admin')) {
        throw new ForbiddenError('You are not allowed to view these invitations', 'NOT_ALLOWED');
      }
    }
    const rows = await this.deps.invitations.listForTeam(teamId);
    return rows.map(toDto);
  }

  async findMyInvitation(
    actorId: string,
    tournamentId: string,
  ): Promise<TournamentInvitationDto | null> {
    const row = await this.deps.invitations.findPendingForUserAndTournament(actorId, tournamentId);
    return row ? toDto(row) : null;
  }

  async listMine(actorId: string): Promise<TournamentInvitationDto[]> {
    const rows = await this.deps.invitations.listForUser(actorId);
    return rows.map(toDto);
  }

  async respond(
    actorId: string,
    invitationId: string,
    decision: 'accept' | 'decline',
  ): Promise<void> {
    const invitation = await this.deps.invitations.findById(invitationId);
    if (!invitation) throw new NotFoundError('Invitation not found');
    if (invitation.status !== 'invited') {
      throw new ConflictError('This invitation has already been responded to.', 'INVALID_STATUS');
    }

    if (invitation.entityType === 'team') {
      await this.respondAsTeam(actorId, invitation, decision);
    } else {
      await this.respondAsPlayer(actorId, invitation, decision);
    }
  }

  private async respondAsTeam(
    actorId: string,
    invitation: TournamentInvitationRow,
    decision: 'accept' | 'decline',
  ): Promise<void> {
    const team = await this.deps.teams.findById(invitation.entityId);
    if (!team) throw new NotFoundError('Team not found');
    if (team.managerId !== actorId) {
      const roles = await this.deps.authz.getRoles(actorId);
      if (!roles.includes('platform_admin')) {
        throw new ForbiddenError(
          'You are not allowed to respond to this invitation',
          'NOT_ALLOWED',
        );
      }
    }

    if (decision === 'decline') {
      const claimed = await this.deps.invitations.claimResponse(invitation.id, 'declined');
      if (!claimed) {
        throw new ConflictError('This invitation has already been responded to.', 'INVALID_STATUS');
      }
      await this.notifyOrganizerOfDecline(claimed);
      return;
    }

    const claimed = await this.deps.invitations.claimResponse(invitation.id, 'accepted');
    if (!claimed) {
      throw new ConflictError('This invitation has already been responded to.', 'INVALID_STATUS');
    }
    try {
      await this.deps.registrations.register(
        team.managerId,
        invitation.tournamentId,
        {
          teamId: invitation.entityId,
          tournamentAgeGroupId: invitation.tournamentAgeGroupId,
          overrideEligibility: true,
        },
        { overrideRegistrationWindow: true, overrideCapacity: invitation.capacityOverridden },
      );
    } catch (err) {
      await this.deps.invitations.updateStatus(invitation.id, 'invited');
      throw err;
    }
  }

  private async respondAsPlayer(
    actorId: string,
    invitation: TournamentInvitationRow,
    decision: 'accept' | 'decline',
  ): Promise<void> {
    if (invitation.entityId !== actorId) {
      const roles = await this.deps.authz.getRoles(actorId);
      if (!roles.includes('platform_admin')) {
        throw new ForbiddenError(
          'You are not allowed to respond to this invitation',
          'NOT_ALLOWED',
        );
      }
    }

    if (decision === 'decline') {
      const claimed = await this.deps.invitations.claimResponse(invitation.id, 'declined');
      if (!claimed) {
        throw new ConflictError('This invitation has already been responded to.', 'INVALID_STATUS');
      }
      await this.notifyOrganizerOfDecline(claimed);
      return;
    }

    const claimed = await this.deps.invitations.claimResponse(invitation.id, 'accepted');
    if (!claimed) {
      throw new ConflictError('This invitation has already been responded to.', 'INVALID_STATUS');
    }
    try {
      await this.deps.registrations.register(
        invitation.entityId,
        invitation.tournamentId,
        { tournamentAgeGroupId: invitation.tournamentAgeGroupId, overrideEligibility: false },
        {
          overrideEligibility: true,
          overrideRegistrationWindow: true,
          overrideCapacity: invitation.capacityOverridden,
        },
      );
    } catch (err) {
      await this.deps.invitations.updateStatus(invitation.id, 'invited');
      throw err;
    }
  }

  async respondForChild(
    parentId: string,
    childId: string,
    invitationId: string,
    decision: 'accept' | 'decline',
  ): Promise<void> {
    await this.deps.authz.assertRole(parentId, 'parent');
    await this.deps.parents.assertOwnedMinor(parentId, childId);

    const invitation = await this.deps.invitations.findById(invitationId);
    if (!invitation) throw new NotFoundError('Invitation not found');
    if (invitation.entityType !== 'player' || invitation.entityId !== childId) {
      throw new ForbiddenError('You are not allowed to respond to this invitation', 'NOT_ALLOWED');
    }
    if (invitation.status !== 'invited') {
      throw new ConflictError('This invitation has already been responded to.', 'INVALID_STATUS');
    }

    if (decision === 'decline') {
      const claimed = await this.deps.invitations.claimResponse(invitation.id, 'declined');
      if (!claimed) {
        throw new ConflictError('This invitation has already been responded to.', 'INVALID_STATUS');
      }
      await this.notifyOrganizerOfDecline(claimed);
      return;
    }

    const claimed = await this.deps.invitations.claimResponse(invitation.id, 'accepted');
    if (!claimed) {
      throw new ConflictError('This invitation has already been responded to.', 'INVALID_STATUS');
    }
    try {
      await this.deps.registrations.registerChild(
        parentId,
        childId,
        invitation.tournamentId,
        invitation.tournamentAgeGroupId,
        undefined,
        {
          overrideEligibility: true,
          overrideRegistrationWindow: true,
          overrideCapacity: invitation.capacityOverridden,
        },
      );
    } catch (err) {
      await this.deps.invitations.updateStatus(invitation.id, 'invited');
      throw err;
    }
  }

  private async notifyOrganizerOfDecline(invitation: TournamentInvitationRow): Promise<void> {
    const tournament = await this.deps.tournaments.findById(invitation.tournamentId);
    if (!tournament) return;
    await this.deps.notifications.notify({
      userId: tournament.organizerId,
      type: 'tournament_invitation_declined',
      title: `Invitation declined: ${invitation.tournamentName}`,
      body: `${invitation.entityName} declined your invitation to ${invitation.tournamentName}.`,
      payload: {
        tournamentId: invitation.tournamentId,
        ...(invitation.entityType === 'team' ? { teamId: invitation.entityId } : {}),
      },
    });
  }
}
