import type {
  FamilyRegistrationDto,
  OrganizerPlayerProfileDto,
  OrganizerRegistrationsDto,
  PaymentStatusValue,
  PlayerRegistrationDetailDto,
  RecruitablePlayerDto,
  RecruitingTeamDto,
  RegisterInput,
  RegistrationDto,
  TeamRegistrationDetailDto,
} from '@nforce/shared';
import { Prisma, type User } from '@prisma/client';
import { isDobEligible, isGenderEligible, registrationWindowStatus } from '../../lib/age';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import type { TxRunner } from '../../lib/db';
import type { AuditPort } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';
import type { ParentService } from '../parents/parent.service';
import type { PlayerProfileService } from '../players/playerProfile.service';
import type { TeamRepoPort } from '../teams/team.repo';
import type { OrganizerTournamentRepoPort } from '../tournaments/organizerTournament.repo';
import type { AuthzService } from '../users-auth/authz.service';
import type { UserRepoPort } from '../users-auth/user.repo';
import type {
  RegistrationEligibilityInfo,
  RegistrationEntity,
  RegistrationRepoPort,
  RegistrationRow,
  TournamentAgeGroupBracket,
} from './registration.repo';

function toDto(row: RegistrationRow): RegistrationDto {
  return {
    id: row.id,
    entityType: row.userId ? 'player' : 'team',
    entityId: (row.userId ?? row.teamId)!,
    entityName: row.entityName,
    status: row.status,
    tournamentAgeGroupId: row.tournamentAgeGroupId,
    ageGroupLabel: row.ageGroupLabel,
    createdAt: row.createdAt.toISOString(),
    capacityOverridden: row.capacityOverridden,
  };
}

function resolveBracket(
  info: RegistrationEligibilityInfo,
  tournamentAgeGroupId: string,
  allowClosedWindow = false,
): TournamentAgeGroupBracket {
  const bracket = info.ageGroups.find((g) => g.id === tournamentAgeGroupId);
  if (!bracket)
    throw new NotFoundError('Age group not found for this tournament', 'AGE_GROUP_NOT_FOUND');
  if (!allowClosedWindow) {
    const status = registrationWindowStatus(bracket);
    if (!status.open) throw new ConflictError(status.message, 'REGISTRATION_WINDOW_CLOSED');
  }
  return bracket;
}

export interface RegistrationServiceDeps {
  registrations: RegistrationRepoPort;
  users: Pick<UserRepoPort, 'findById' | 'listManagedChildren'>;
  teams: Pick<
    TeamRepoPort,
    'findById' | 'listByManager' | 'listDraftTeamsForAgeGroup' | 'removeRosterEntry'
  >;
  tournaments: Pick<OrganizerTournamentRepoPort, 'findById'>;
  notifications: NotificationService;
  authz: AuthzService;
  audit: AuditPort;
  tx: TxRunner;
  parents: Pick<ParentService, 'assertOwnedMinor' | 'assertChildIsMinor'>;
  playerProfile: Pick<PlayerProfileService, 'getProfile'>;
}

export class RegistrationService {
  constructor(private readonly deps: RegistrationServiceDeps) {}

  async register(
    actorId: string,
    tournamentId: string,
    input: RegisterInput,
    opts?: {
      overrideEligibility?: boolean;
      overrideRegistrationWindow?: boolean;
      overrideCapacity?: boolean;
    },
  ): Promise<RegistrationDto> {
    const actor = await this.deps.users.findById(actorId);
    if (!actor) throw new NotFoundError('User not found');
    if (!actor.verified) {
      throw new ForbiddenError(
        'Verify your email before registering for a tournament.',
        'EMAIL_NOT_VERIFIED',
      );
    }

    const info = await this.deps.registrations.findTournamentInfo(tournamentId);
    if (!info) throw new NotFoundError('Tournament not found');
    if (info.status !== 'published') {
      throw new ConflictError(
        'This tournament is not open for registration.',
        'TOURNAMENT_NOT_PUBLISHED',
      );
    }
    const bracket = resolveBracket(
      info,
      input.tournamentAgeGroupId,
      opts?.overrideRegistrationWindow ?? false,
    );

    if (input.teamId && info.teamSelectionMode === 'draft_based') {
      throw new ConflictError(
        'This tournament uses draft-based team selection. Register as an individual player, not a team.',
        'TEAM_REGISTRATION_NOT_ALLOWED',
      );
    }

    const { entity, notifyUserId, overrideUsed } = input.teamId
      ? await this.resolveTeamEntity(
          actorId,
          input.teamId,
          bracket,
          input.overrideEligibility ?? false,
        )
      : await this.resolvePlayerEntity(actorId, actor, bracket, opts?.overrideEligibility ?? false);

    const created = await this.runRegistrationTx(
      tournamentId,
      { ...entity, tournamentAgeGroupId: bracket.id },
      info,
      opts?.overrideCapacity ?? false,
    );
    const row = await this.deps.registrations.findById(created.id);
    const tournament = await this.deps.tournaments.findById(tournamentId);

    const complianceNote =
      (overrideUsed
        ? " Note: this doesn't fully meet this age group's requirements. It was registered anyway with an eligibility override."
        : '') +
      (row!.capacityOverridden
        ? ' Note: the tournament was already full. This registration was let in anyway via a capacity override.'
        : '');
    await this.deps.notifications.notify({
      userId: notifyUserId,
      type: 'registration_confirmed',
      title: 'Registration confirmed',
      body: `Your registration for ${tournament?.name ?? 'the tournament'} has been confirmed.${complianceNote}`,
      payload: { tournamentId },
    });
    if (tournament && tournament.organizerId !== notifyUserId) {
      await this.deps.notifications.notify({
        userId: tournament.organizerId,
        type: 'new_registration',
        title: `New registration: ${tournament.name}`,
        body: `${row!.entityName} registered for ${tournament.name}.${complianceNote}`,
        payload: { tournamentId, registrationId: created.id },
      });
    }

    return toDto(row!);
  }

  private assertAgeEligible(
    subject: { dateOfBirth: Date | null },
    subjectLabel: string,
    bracket: TournamentAgeGroupBracket,
    overrideEligibility: boolean,
  ): void {
    const bounded = bracket.bornAfter != null || bracket.bornBefore != null;
    if (bounded && !subject.dateOfBirth) {
      if (overrideEligibility) return;
      throw new ConflictError(
        `${subjectLabel === 'You' ? 'Add your date of birth' : `${subjectLabel} needs a date of birth added`} in the profile section to register for this age group.`,
        'DOB_REQUIRED',
      );
    }
    if (
      !isDobEligible(subject.dateOfBirth, {
        bornAfter: bracket.bornAfter,
        bornBefore: bracket.bornBefore,
      })
    ) {
      if (overrideEligibility) return;
      throw new ConflictError(
        `${subjectLabel} ${subjectLabel === 'You' ? 'do' : 'does'} not meet this tournament's age group.`,
        'AGE_GROUP_MISMATCH',
      );
    }
  }

  private assertGenderEligible(
    subject: { gender: User['gender'] },
    subjectLabel: string,
    bracket: TournamentAgeGroupBracket,
    overrideEligibility: boolean,
  ): void {
    if (bracket.genderCategory !== 'mixed' && !subject.gender) {
      if (overrideEligibility) return;
      throw new ConflictError(
        `${subjectLabel === 'You' ? 'Add your gender' : `${subjectLabel} needs a gender added`} in the profile section to register for this age group.`,
        'GENDER_REQUIRED',
      );
    }
    if (!isGenderEligible(subject.gender, bracket.genderCategory)) {
      if (overrideEligibility) return;
      throw new ConflictError(
        `${subjectLabel} ${subjectLabel === 'You' ? 'do' : 'does'} not meet this tournament age group's gender category. Contact the tournament organizer if you believe you should still be able to register: they can invite you in directly.`,
        'GENDER_CATEGORY_MISMATCH',
      );
    }
  }

  private assertConsentGiven(
    subject: { consentAcceptedAt: Date | null },
    subjectLabel: string,
    overrideEligibility: boolean,
  ): void {
    if (!subject.consentAcceptedAt) {
      if (overrideEligibility) return;
      throw new ConflictError(
        `${subjectLabel} must complete the cricket profile and consent before registering.`,
        'PROFILE_INCOMPLETE',
      );
    }
  }

  assertEligibility(
    subject: { dateOfBirth: Date | null; gender: User['gender']; consentAcceptedAt: Date | null },
    subjectLabel: string,
    bracket: TournamentAgeGroupBracket,
    overrideEligibility: boolean,
  ): void {
    this.assertAgeEligible(subject, subjectLabel, bracket, overrideEligibility);
    this.assertGenderEligible(subject, subjectLabel, bracket, overrideEligibility);
    this.assertConsentGiven(subject, subjectLabel, overrideEligibility);
  }

  private isEligible(
    subject: { dateOfBirth: Date | null; gender: User['gender']; consentAcceptedAt: Date | null },
    bracket: TournamentAgeGroupBracket,
  ): boolean {
    try {
      this.assertEligibility(subject, '', bracket, false);
      return true;
    } catch (err) {
      if (err instanceof ConflictError) return false;
      throw err;
    }
  }

  private async resolvePlayerEntity(
    actorId: string,
    actor: User,
    bracket: TournamentAgeGroupBracket,
    overrideEligibility: boolean,
  ): Promise<{
    entity: Omit<RegistrationEntity, 'tournamentAgeGroupId'>;
    notifyUserId: string;
    overrideUsed: boolean;
  }> {
    await this.deps.authz.assertRole(actorId, 'player');
    let overrideUsed = false;
    if (overrideEligibility) {
      try {
        this.assertEligibility(actor, 'You', bracket, false);
      } catch (err) {
        if (!(err instanceof ConflictError)) throw err;
        overrideUsed = true;
      }
    }
    this.assertEligibility(actor, 'You', bracket, overrideEligibility);
    return { entity: { userId: actorId }, notifyUserId: actorId, overrideUsed };
  }

  async registerChild(
    parentId: string,
    childId: string,
    tournamentId: string,
    tournamentAgeGroupId: string,
    ip?: string,
    opts?: {
      overrideEligibility?: boolean;
      overrideRegistrationWindow?: boolean;
      overrideCapacity?: boolean;
    },
  ): Promise<RegistrationDto> {
    await this.deps.authz.assertRole(parentId, 'parent');
    const child = await this.deps.parents.assertOwnedMinor(parentId, childId);

    const info = await this.deps.registrations.findTournamentInfo(tournamentId);
    if (!info) throw new NotFoundError('Tournament not found');
    if (info.status !== 'published') {
      throw new ConflictError(
        'This tournament is not open for registration.',
        'TOURNAMENT_NOT_PUBLISHED',
      );
    }
    const bracket = resolveBracket(
      info,
      tournamentAgeGroupId,
      opts?.overrideRegistrationWindow ?? false,
    );
    this.assertEligibility(child, child.name, bracket, opts?.overrideEligibility ?? false);

    const created = await this.runRegistrationTx(
      tournamentId,
      { userId: childId, tournamentAgeGroupId: bracket.id },
      info,
      opts?.overrideCapacity ?? false,
      async (_row, db) => {
        await this.deps.audit.write(
          {
            action: 'registration.created',
            actorUserId: parentId,
            entityType: 'user',
            entityId: childId,
            meta: { tournamentId, onBehalfOf: childId },
            ip,
          },
          db,
        );
      },
    );
    const row = await this.deps.registrations.findById(created.id);
    const tournament = await this.deps.tournaments.findById(tournamentId);
    const complianceNote = row!.capacityOverridden
      ? ' Note: the tournament was already full. This registration was let in anyway via a capacity override.'
      : '';

    await this.deps.notifications.notify({
      userId: parentId,
      type: 'registration_confirmed',
      title: 'Registration confirmed',
      body: `${child.name}'s registration for ${tournament?.name ?? 'the tournament'} has been confirmed.${complianceNote}`,
      payload: { tournamentId, childId, childName: child.name },
    });
    if (tournament && tournament.organizerId !== parentId) {
      await this.deps.notifications.notify({
        userId: tournament.organizerId,
        type: 'new_registration',
        title: `New registration: ${tournament.name}`,
        body: `${row!.entityName} registered for ${tournament.name}.${complianceNote}`,
        payload: { tournamentId, registrationId: created.id },
      });
    }

    return toDto(row!);
  }

  private async resolveTeamEntity(
    actorId: string,
    teamId: string,
    bracket: TournamentAgeGroupBracket,
    overrideEligibility: boolean,
  ): Promise<{
    entity: Omit<RegistrationEntity, 'tournamentAgeGroupId'>;
    notifyUserId: string;
    overrideUsed: boolean;
  }> {
    await this.deps.authz.assertRole(actorId, 'team_manager');
    const team = await this.deps.teams.findById(teamId);
    if (!team) throw new NotFoundError('Team not found');
    if (team.managerId !== actorId) {
      throw new ForbiddenError('You do not manage this team', 'NOT_ALLOWED');
    }
    let overrideUsed = false;
    for (const member of team.roster.filter((r) => r.status === 'accepted')) {
      const player = await this.deps.users.findById(member.userId);
      if (!player) {
        if (overrideEligibility) {
          overrideUsed = true;
          continue;
        }
        throw new ConflictError(
          `${member.name} does not meet this tournament's age group.`,
          'AGE_GROUP_MISMATCH',
        );
      }
      if (overrideEligibility) {
        try {
          this.assertEligibility(player, member.name, bracket, false);
        } catch (err) {
          if (!(err instanceof ConflictError)) throw err;
          overrideUsed = true;
        }
      }
      this.assertEligibility(player, member.name, bracket, overrideEligibility);
    }
    return { entity: { teamId }, notifyUserId: team.managerId, overrideUsed };
  }

  private async runRegistrationTx(
    tournamentId: string,
    entity: RegistrationEntity,
    info: RegistrationEligibilityInfo,
    overrideCapacity: boolean,
    onCreated?: (created: { id: string }, db: Prisma.TransactionClient) => Promise<void>,
  ): Promise<{ id: string }> {
    try {
      return await this.deps.tx.run(
        async (db) => {
          const capacityRelevant =
            info.teamSelectionMode === 'draft_based'
              ? entity.userId != null
              : entity.teamId != null;
          const bracket = info.ageGroups.find((g) => g.id === entity.tournamentAgeGroupId);
          let capacityOverridden = false;
          if (capacityRelevant && bracket?.capacity != null) {
            const entityType = entity.teamId != null ? 'team' : 'player';
            const activeCount = await this.deps.registrations.countActive(
              entity.tournamentAgeGroupId,
              entityType,
              db,
            );
            if (activeCount >= bracket.capacity) {
              if (!overrideCapacity) {
                throw new ConflictError('This category is full.', 'TOURNAMENT_FULL');
              }
              capacityOverridden = true;
            }
          }
          let created: { id: string };
          try {
            created = await this.deps.registrations.create(
              tournamentId,
              { ...entity, capacityOverridden },
              db,
            );
          } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
              throw new ConflictError(
                'Already registered for this category.',
                'ALREADY_REGISTERED',
              );
            }
            throw err;
          }
          if (onCreated) await onCreated(created, db);
          return created;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new ConflictError(
          'A conflicting change happened at the same moment. Please try again.',
          'REGISTRATION_CONFLICT',
        );
      }
      throw err;
    }
  }

  private async assertCanManage(actorId: string, reg: RegistrationRow): Promise<void> {
    if (reg.userId === actorId) return;
    if (reg.userId) {
      const regUser = await this.deps.users.findById(reg.userId);
      if (regUser?.managedByParentId === actorId) {
        this.deps.parents.assertChildIsMinor(regUser);
        return;
      }
    }
    if (reg.teamId) {
      const team = await this.deps.teams.findById(reg.teamId);
      if (team && team.managerId === actorId) return;
    }
    const tournament = await this.deps.tournaments.findById(reg.tournamentId);
    if (tournament && tournament.organizerId === actorId) return;
    const roles = await this.deps.authz.getRoles(actorId);
    if (roles.includes('platform_admin')) return;
    throw new ForbiddenError('You are not allowed to manage this registration', 'NOT_ALLOWED');
  }

  async withdraw(actorId: string, registrationId: string, ip?: string): Promise<void> {
    const reg = await this.deps.registrations.findById(registrationId);
    if (!reg) throw new NotFoundError('Registration not found');
    await this.assertCanManage(actorId, reg);
    if (reg.status !== 'active') return;

    const tournament = await this.deps.tournaments.findById(reg.tournamentId);

    await this.deps.tx.run(async (db) => {
      await this.deps.registrations.withdraw(registrationId, db);
      await this.deps.audit.write(
        {
          action: 'registration.withdrawn',
          actorUserId: actorId,
          entityType: reg.userId ? 'user' : 'team',
          entityId: (reg.userId ?? reg.teamId)!,
          meta: { tournamentId: reg.tournamentId },
          ip,
        },
        db,
      );
      if (tournament?.teamSelectionMode === 'draft_based' && reg.userId) {
        const draftTeams = await this.deps.teams.listDraftTeamsForAgeGroup(
          reg.tournamentAgeGroupId,
        );
        const onTeam = draftTeams.find((t) => t.roster.some((r) => r.userId === reg.userId));
        if (onTeam) {
          await this.deps.teams.removeRosterEntry(onTeam.id, reg.userId, db);
        }
      }
    });

    if (!tournament) return;

    let registrantNotifyId: string | null = null;
    let isActorTheRegistrant = false;
    if (reg.teamId) {
      const team = await this.deps.teams.findById(reg.teamId);
      registrantNotifyId = team?.managerId ?? null;
      isActorTheRegistrant = team?.managerId === actorId;
    } else if (reg.userId) {
      const regUser = await this.deps.users.findById(reg.userId);
      registrantNotifyId = regUser?.managedByParentId ?? reg.userId;
      isActorTheRegistrant = actorId === reg.userId || regUser?.managedByParentId === actorId;
    }

    if (!isActorTheRegistrant && registrantNotifyId) {
      await this.deps.notifications.notify({
        userId: registrantNotifyId,
        type: 'registration_withdrawn',
        title: `Withdrawn: ${tournament.name}`,
        body: `${reg.entityName}'s registration for ${tournament.name} was withdrawn.`,
        payload: { tournamentId: reg.tournamentId, registrationId, forRole: 'registrant' },
      });
    }
    if (tournament.organizerId !== actorId) {
      await this.deps.notifications.notify({
        userId: tournament.organizerId,
        type: 'registration_withdrawn',
        title: `Withdrawal: ${tournament.name}`,
        body: `${reg.entityName} withdrew from ${tournament.name}.`,
        payload: { tournamentId: reg.tournamentId, registrationId, forRole: 'organizer' },
      });
    }
  }

  async withdrawRedundantIndividualEntries(
    actorId: string,
    playerId: string,
    teamId: string,
    ip?: string,
  ): Promise<void> {
    const overlapping = await this.deps.registrations.findOverlappingIndividualRegistrations(
      playerId,
      teamId,
    );
    for (const reg of overlapping) {
      await this.deps.tx.run(async (db) => {
        await this.deps.registrations.withdraw(reg.id, db);
        await this.deps.audit.write(
          {
            action: 'registration.withdrawn',
            actorUserId: actorId,
            entityType: 'user',
            entityId: playerId,
            meta: { tournamentId: reg.tournamentId, teamId, autoWithdrawn: true },
            ip,
          },
          db,
        );
      });
      const tournament = await this.deps.tournaments.findById(reg.tournamentId);
      await this.deps.notifications.notify({
        userId: playerId,
        type: 'registration_withdrawn',
        title: `Registration updated: ${tournament?.name ?? 'tournament'}`,
        body: `Your individual registration for ${tournament?.name ?? 'the tournament'} was automatically removed since your team's registration already covers you.`,
        payload: { tournamentId: reg.tournamentId },
      });
    }
  }

  isTeamRegisteredUnderOrganizer(organizerId: string, teamId: string): Promise<boolean> {
    return this.deps.registrations.isTeamRegisteredUnderOrganizer(teamId, organizerId);
  }

  async findMine(actorId: string, tournamentId: string): Promise<RegistrationDto[]> {
    const [rows, myTeams, info] = await Promise.all([
      this.deps.registrations.listForTournament(tournamentId),
      this.deps.teams.listByManager(actorId),
      this.deps.registrations.findTournamentInfo(tournamentId),
    ]);
    const myTeamIds = new Set(myTeams.map((t) => t.id));
    const bracketById = new Map((info?.ageGroups ?? []).map((g) => [g.id, g]));
    const mine = rows.filter(
      (r) =>
        r.status === 'active' && (r.userId === actorId || (r.teamId && myTeamIds.has(r.teamId))),
    );
    return Promise.all(
      mine.map(async (r) => {
        const bracket = bracketById.get(r.tournamentAgeGroupId);
        let eligible = true;
        if (bracket) {
          if (r.userId) {
            const user = await this.deps.users.findById(r.userId);
            eligible = !user || this.isEligible(user, bracket);
          } else if (r.teamId) {
            const team = await this.deps.teams.findById(r.teamId);
            const accepted = (team?.roster ?? []).filter((m) => m.status === 'accepted');
            for (const member of accepted) {
              const memberUser = await this.deps.users.findById(member.userId);
              if (memberUser && !this.isEligible(memberUser, bracket)) {
                eligible = false;
                break;
              }
            }
          }
        }
        return { ...toDto(r), eligible };
      }),
    );
  }

  async findFamily(parentId: string): Promise<FamilyRegistrationDto[]> {
    await this.deps.authz.assertRole(parentId, 'parent');
    const children = await this.deps.users.listManagedChildren(parentId);
    if (children.length === 0) return [];
    const childById = new Map(children.map((c) => [c.id, c]));
    const rows = await this.deps.registrations.listActiveForUsers([...childById.keys()]);
    return rows.map((r) => ({
      registrationId: r.id,
      childId: r.userId!,
      childName: childById.get(r.userId!)?.name ?? r.entityName,
      tournamentId: r.tournamentId,
      tournamentName: r.tournamentName,
      tournamentAgeGroupId: r.tournamentAgeGroupId,
      ageGroupLabel: r.ageGroupLabel,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private async assertCanViewRegistrations(actorId: string, tournamentId: string): Promise<void> {
    const tournament = await this.deps.tournaments.findById(tournamentId);
    if (!tournament) throw new NotFoundError('Tournament not found');
    if (tournament.organizerId !== actorId) {
      const roles = await this.deps.authz.getRoles(actorId);
      if (!roles.includes('platform_admin')) {
        throw new ForbiddenError('You are not allowed to view these registrations', 'NOT_ALLOWED');
      }
    }
  }

  async listFor(actorId: string, tournamentId: string): Promise<RegistrationDto[]> {
    await this.assertCanViewRegistrations(actorId, tournamentId);
    const rows = await this.deps.registrations.listForTournament(tournamentId);
    return rows.map(toDto);
  }

  async listDetailFor(actorId: string, tournamentId: string): Promise<OrganizerRegistrationsDto> {
    await this.assertCanViewRegistrations(actorId, tournamentId);
    const [rows, info, payments] = await Promise.all([
      this.deps.registrations.listForTournament(tournamentId),
      this.deps.registrations.findTournamentInfo(tournamentId),
      this.deps.registrations.listPaymentsForTournament(tournamentId),
    ]);
    const bracketById = new Map((info?.ageGroups ?? []).map((g) => [g.id, g]));
    const paymentByKey = new Map(payments.map((p) => [`${p.registrationId}:${p.userId}`, p]));
    const paymentFor = (registrationId: string, userId: string) => {
      const p = paymentByKey.get(`${registrationId}:${userId}`);
      return {
        paymentStatus: p?.status ?? ('unpaid' as PaymentStatusValue),
        paymentAmountPaid: p?.amountPaid ?? null,
      };
    };

    const teams: TeamRegistrationDetailDto[] = await Promise.all(
      rows
        .filter((r) => r.teamId)
        .map(async (r) => {
          const team = await this.deps.teams.findById(r.teamId!);
          const bracket = bracketById.get(r.tournamentAgeGroupId);
          const roster = await Promise.all(
            (team?.roster ?? []).map(async (m) => {
              let eligible = true;
              if (bracket && m.status === 'accepted') {
                const player = await this.deps.users.findById(m.userId);
                eligible = !player || this.isEligible(player, bracket);
              }
              return {
                userId: m.userId,
                name: m.name,
                roleInTeam: m.roleInTeam,
                status: m.status,
                eligible,
                ...paymentFor(r.id, m.userId),
              };
            }),
          );
          return {
            registrationId: r.id,
            teamId: r.teamId!,
            teamName: r.entityName,
            managerName: team?.managerName ?? 'Unknown',
            managerAcademyName: team?.managerAcademyName ?? null,
            status: r.status,
            roster,
            tournamentAgeGroupId: r.tournamentAgeGroupId,
            capacityOverridden: r.capacityOverridden,
            teamPaymentStatus: r.teamPaymentStatus,
            teamPaymentAmountPaid: r.teamPaymentAmountPaid,
          };
        }),
    );

    const players: PlayerRegistrationDetailDto[] = await Promise.all(
      rows
        .filter((r) => r.userId && r.status === 'active')
        .map(async (r) => {
          const bracket = bracketById.get(r.tournamentAgeGroupId);
          let eligible = true;
          if (bracket) {
            const user = await this.deps.users.findById(r.userId!);
            eligible = !user || this.isEligible(user, bracket);
          }
          return {
            registrationId: r.id,
            userId: r.userId!,
            name: r.entityName,
            eligible,
            ...paymentFor(r.id, r.userId!),
            tournamentAgeGroupId: r.tournamentAgeGroupId,
            capacityOverridden: r.capacityOverridden,
          };
        }),
    );

    return { teams, players };
  }

  private async isActivelyInTournament(userId: string, tournamentId: string): Promise<boolean> {
    const rows = await this.deps.registrations.listForTournament(tournamentId);
    for (const r of rows) {
      if (r.status !== 'active') continue;
      if (r.userId === userId) return true;
      if (r.teamId) {
        const team = await this.deps.teams.findById(r.teamId);
        if (team?.roster.some((m) => m.userId === userId && m.status === 'accepted')) return true;
      }
    }
    return false;
  }

  async getPlayerContactProfile(
    actorId: string,
    tournamentId: string,
    userId: string,
  ): Promise<OrganizerPlayerProfileDto> {
    await this.assertCanViewRegistrations(actorId, tournamentId);
    if (!(await this.isActivelyInTournament(userId, tournamentId))) {
      throw new NotFoundError('This player is not registered in this tournament');
    }
    const [profile, user] = await Promise.all([
      this.deps.playerProfile.getProfile(userId),
      this.deps.users.findById(userId),
    ]);
    return {
      ...profile,
      phone: user?.phone ?? null,
      emergencyContactName: user?.emergencyContactName ?? null,
      emergencyContactPhone: user?.emergencyContactPhone ?? null,
    };
  }

  async updatePayment(
    actorId: string,
    registrationId: string,
    targetUserId: string,
    status: PaymentStatusValue,
    amountPaid: number | null,
    ip?: string,
  ): Promise<void> {
    const reg = await this.deps.registrations.findById(registrationId);
    if (!reg) throw new NotFoundError('Registration not found');
    await this.assertCanViewRegistrations(actorId, reg.tournamentId);

    if (reg.userId) {
      if (reg.userId !== targetUserId) {
        throw new NotFoundError('This player is not part of this registration');
      }
    } else if (reg.teamId) {
      const team = await this.deps.teams.findById(reg.teamId);
      if (!team || !team.roster.some((m) => m.userId === targetUserId)) {
        throw new NotFoundError('This player is not on this team’s roster');
      }
    }

    const previous = await this.deps.registrations.findPayment(registrationId, targetUserId);
    const nextAmount = status === 'partial' ? amountPaid : null;
    await this.deps.registrations.upsertPayment(registrationId, targetUserId, {
      status,
      amountPaid: nextAmount,
    });
    await this.deps.audit.write({
      action: 'registration.payment_updated',
      actorUserId: actorId,
      entityType: 'user',
      entityId: targetUserId,
      meta: {
        tournamentId: reg.tournamentId,
        status,
        amountPaid: nextAmount,
        previousStatus: previous?.status ?? 'unpaid',
        previousAmountPaid: previous?.amountPaid ?? null,
      },
      ip,
    });
  }

  async updateTeamPayment(
    actorId: string,
    registrationId: string,
    status: PaymentStatusValue,
    amountPaid: number | null,
    ip?: string,
  ): Promise<void> {
    const reg = await this.deps.registrations.findById(registrationId);
    if (!reg) throw new NotFoundError('Registration not found');
    await this.assertCanViewRegistrations(actorId, reg.tournamentId);
    if (!reg.teamId) {
      throw new ConflictError(
        'Team payment only applies to a team registration',
        'NOT_A_TEAM_REGISTRATION',
      );
    }

    const previousStatus = reg.teamPaymentStatus;
    const previousAmountPaid = reg.teamPaymentAmountPaid;
    const nextAmount = status === 'partial' ? amountPaid : null;
    await this.deps.registrations.updateTeamPayment(registrationId, {
      status,
      amountPaid: nextAmount,
    });
    await this.deps.audit.write({
      action: 'registration.team_payment_updated',
      actorUserId: actorId,
      entityType: 'registration',
      entityId: registrationId,
      meta: {
        tournamentId: reg.tournamentId,
        status,
        amountPaid: nextAmount,
        previousStatus,
        previousAmountPaid,
      },
      ip,
    });
  }

  async listRecruitablePlayers(
    actorId: string,
    tournamentId: string,
  ): Promise<RecruitablePlayerDto[]> {
    await this.deps.authz.assertRole(actorId, 'team_manager');
    const rows = await this.deps.registrations.listForTournament(tournamentId);
    const active = rows.filter((r) => r.status === 'active' && r.userId);
    const players = await Promise.all(
      active.map(async (r): Promise<RecruitablePlayerDto | null> => {
        const user = await this.deps.users.findById(r.userId!);
        if (!user) return null;
        const managedByParentName = user.managedByParentId
          ? ((await this.deps.users.findById(user.managedByParentId))?.name ?? null)
          : null;
        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          isManagedChild: !!user.managedByParentId,
          managedByParentName,
        };
      }),
    );
    return players.filter((p): p is RecruitablePlayerDto => p !== null);
  }

  async listRecruitingTeams(actorId: string, tournamentId: string): Promise<RecruitingTeamDto[]> {
    await this.deps.authz.assertRole(actorId, 'player');
    const rows = await this.deps.registrations.listForTournament(tournamentId);
    return rows
      .filter((r) => r.status === 'active' && r.teamId)
      .map((r) => ({ teamId: r.teamId!, name: r.entityName }));
  }
}
