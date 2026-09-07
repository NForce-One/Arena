import { hash as argon2Hash } from '@node-rs/argon2';
import type { Gender } from '@prisma/client';
import type {
  AddChildInput,
  AdminChildDto,
  ChildDto,
  ChildFixtureEntryDto,
  ProfileDto,
  SportsProfileInput,
  UpdateChildInput,
} from '@nforce/shared';
import { randomUUID } from 'node:crypto';
import { ageAsOf } from '../../lib/age';
import type { TxRunner } from '../../lib/db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import type { AuditPort } from '../audit/audit.service';
import type { FixtureRepoPort } from '../fixtures/fixture.repo';
import type { ResultRepoPort } from '../results/result.repo';
import type { TeamRepoPort } from '../teams/team.repo';
import { syncClubId } from '../users-auth/clubId';
import type { AuthzService } from '../users-auth/authz.service';
import { ROLE_IDS } from '../users-auth/roles';
import type { ManagedChildWithParent, UserRepoPort } from '../users-auth/user.repo';
import type { UsersService } from '../users-auth/users.service';

const ADULT_AGE = 18;
const APPROACHING_ADULTHOOD_WINDOW_DAYS = 180;

function daysUntilEighteenth(dateOfBirth: Date, now: Date): number {
  const eighteenth = Date.UTC(
    dateOfBirth.getUTCFullYear() + ADULT_AGE,
    dateOfBirth.getUTCMonth(),
    dateOfBirth.getUTCDate(),
  );
  return Math.round((eighteenth - now.getTime()) / 86_400_000);
}

export interface ParentServiceDeps {
  users: UserRepoPort;
  usersService: Pick<
    UsersService,
    'uploadPhoto' | 'deletePhoto' | 'getProfile' | 'applySportsProfile'
  >;
  authz: AuthzService;
  audit: AuditPort;
  tx: TxRunner;
  teams: Pick<TeamRepoPort, 'listAcceptedTeamIdsForUser'>;
  fixtures: Pick<FixtureRepoPort, 'listForTeamIds'>;
  results: Pick<ResultRepoPort, 'findByFixtureIds'>;
}

export class ParentService {
  constructor(private readonly deps: ParentServiceDeps) {}

  assertChildIsMinor(child: { dateOfBirth: Date | null }): void {
    if (!child.dateOfBirth) return;
    if (ageAsOf(child.dateOfBirth, new Date()) >= ADULT_AGE) {
      throw new ConflictError(
        'This child is no longer a minor; the account can no longer be managed on their behalf.',
        'CHILD_NO_LONGER_MINOR',
      );
    }
  }

  async assertOwned(
    parentId: string,
    childId: string,
  ): Promise<{
    id: string;
    name: string;
    email: string;
    dateOfBirth: Date | null;
    photoKey: string | null;
    claimInviteSentAt: Date | null;
    consentAcceptedAt: Date | null;
    jerseyNumber: number | null;
    jerseyName: string | null;
    clubId: string | null;
    gender: Gender | null;
  }> {
    const child = await this.deps.users.findById(childId);
    if (!child || child.managedByParentId !== parentId) {
      throw new ForbiddenError('You do not manage this child account', 'NOT_ALLOWED');
    }
    return child;
  }

  async assertOwnedMinor(
    parentId: string,
    childId: string,
  ): Promise<{
    id: string;
    name: string;
    email: string;
    dateOfBirth: Date | null;
    photoKey: string | null;
    claimInviteSentAt: Date | null;
    consentAcceptedAt: Date | null;
    jerseyNumber: number | null;
    jerseyName: string | null;
    clubId: string | null;
    gender: Gender | null;
  }> {
    const child = await this.assertOwned(parentId, childId);
    this.assertChildIsMinor(child);
    return child;
  }

  private toDto(child: {
    id: string;
    name: string;
    dateOfBirth: Date | null;
    photoKey: string | null;
    claimInviteSentAt: Date | null;
    consentAcceptedAt: Date | null;
    jerseyNumber: number | null;
    jerseyName: string | null;
    clubId: string | null;
  }): ChildDto {
    const dob = child.dateOfBirth!;
    const now = new Date();
    const age = ageAsOf(dob, now);
    const isMinor = age < ADULT_AGE;
    const daysToAdult = daysUntilEighteenth(dob, now);
    return {
      id: child.id,
      name: child.name,
      dateOfBirth: dob.toISOString().slice(0, 10),
      age,
      isMinor,
      approachingAdulthood:
        isMinor && daysToAdult <= APPROACHING_ADULTHOOD_WINDOW_DAYS && !child.claimInviteSentAt,
      claimInviteSentAt: child.claimInviteSentAt ? child.claimInviteSentAt.toISOString() : null,
      photoUrl: null,
      consentConfirmed: child.consentAcceptedAt != null,
      jerseyNumber: child.jerseyNumber,
      jerseyName: child.jerseyName,
      clubId: child.clubId,
    };
  }

  private assertChildBornAfterParent(parentDob: Date | null, childDob: Date): void {
    if (parentDob && childDob <= parentDob) {
      throw new ConflictError(
        "A child's date of birth must be after the parent's own date of birth.",
        'CHILD_DOB_BEFORE_PARENT',
      );
    }
  }

  private async assertNoDuplicateChild(
    parentId: string,
    name: string,
    dateOfBirth: Date,
    excludeChildId?: string,
  ): Promise<void> {
    const siblings = await this.deps.users.listManagedChildren(parentId);
    const normalized = name.trim().toLowerCase();
    const dobKey = dateOfBirth.toISOString().slice(0, 10);
    const duplicate = siblings.some(
      (c) =>
        c.id !== excludeChildId &&
        c.name.trim().toLowerCase() === normalized &&
        c.dateOfBirth?.toISOString().slice(0, 10) === dobKey,
    );
    if (duplicate) {
      throw new ConflictError(
        'You already have a child with this name and date of birth.',
        'DUPLICATE_CHILD_PROFILE',
      );
    }
  }

  async addChild(parentId: string, input: AddChildInput, ip?: string): Promise<ChildDto> {
    await this.deps.authz.assertRole(parentId, 'parent');
    const parent = await this.deps.users.findById(parentId);
    const dobInput = new Date(input.dateOfBirth);
    this.assertChildBornAfterParent(parent?.dateOfBirth ?? null, dobInput);
    await this.assertNoDuplicateChild(parentId, input.name, dobInput);

    const email = `managed-${randomUUID()}@no-login.nforcearena.internal`;
    const passwordHash = await argon2Hash(randomUUID());
    const dateOfBirth = new Date(input.dateOfBirth);

    const child = await this.deps.tx.run(async (db) => {
      const created = await this.deps.users.create(
        {
          name: input.name,
          email,
          passwordHash,
          roleIds: [ROLE_IDS.player],
          dateOfBirth,
          managedByParentId: parentId,
        },
        db,
      );
      await this.deps.audit.write(
        {
          action: 'child.added',
          actorUserId: parentId,
          entityType: 'user',
          entityId: created.id,
          meta: { name: input.name },
          ip,
        },
        db,
      );
      const clubId = await syncClubId(this.deps.users, created.id, db);
      return { ...created, clubId };
    });

    return this.toDto({ ...child, claimInviteSentAt: null });
  }

  async listChildren(parentId: string): Promise<ChildDto[]> {
    await this.deps.authz.assertRole(parentId, 'parent');
    const children = await this.deps.users.listManagedChildren(parentId);
    return Promise.all(
      children.map(async (child) => {
        const dto = this.toDto(child);
        if (child.photoKey) {
          const profile = await this.deps.usersService.getProfile(child.id);
          dto.photoUrl = profile.photoUrl;
        }
        return dto;
      }),
    );
  }

  private toAdminDto(child: ManagedChildWithParent): AdminChildDto {
    return {
      ...this.toDto(child),
      parentId: child.parent?.id ?? '',
      parentName: child.parent?.name ?? 'Unknown',
      parentEmail: child.parent?.email ?? '',
    };
  }

  async listChildrenApproachingAdulthood(adminId: string): Promise<AdminChildDto[]> {
    await this.deps.authz.assertRole(adminId, 'platform_admin');
    const children = await this.deps.users.listAllManagedChildren();
    const now = new Date();
    return children
      .filter(
        (c) =>
          c.dateOfBirth &&
          daysUntilEighteenth(c.dateOfBirth, now) <= APPROACHING_ADULTHOOD_WINDOW_DAYS,
      )
      .map((c) => this.toAdminDto(c));
  }

  async updateChild(
    parentId: string,
    childId: string,
    input: UpdateChildInput,
    ip?: string,
  ): Promise<ChildDto> {
    await this.deps.authz.assertRole(parentId, 'parent');
    await this.assertOwnedMinor(parentId, childId);

    const dateOfBirth = new Date(input.dateOfBirth);
    const parent = await this.deps.users.findById(parentId);
    this.assertChildBornAfterParent(parent?.dateOfBirth ?? null, dateOfBirth);
    await this.assertNoDuplicateChild(parentId, input.name, dateOfBirth, childId);
    const updated = await this.deps.tx.run(async (db) => {
      const child = await this.deps.users.updateChild(childId, { name: input.name, dateOfBirth });
      await this.deps.audit.write(
        {
          action: 'child.updated',
          actorUserId: parentId,
          entityType: 'user',
          entityId: childId,
          meta: { name: input.name },
          ip,
        },
        db,
      );
      return child;
    });
    return this.toDto(updated);
  }

  async uploadChildPhoto(
    parentId: string,
    childId: string,
    input: Parameters<UsersService['uploadPhoto']>[1],
  ): Promise<ChildDto> {
    await this.deps.authz.assertRole(parentId, 'parent');
    const child = await this.assertOwnedMinor(parentId, childId);
    await this.deps.usersService.uploadPhoto(childId, input);
    const refreshed = await this.deps.users.findById(childId);
    if (!refreshed) throw new NotFoundError('User not found');
    const dto = this.toDto({ ...refreshed, claimInviteSentAt: child.claimInviteSentAt });
    const profile = await this.deps.usersService.getProfile(childId);
    dto.photoUrl = profile.photoUrl;
    return dto;
  }

  async deleteChildPhoto(parentId: string, childId: string, ip?: string): Promise<ChildDto> {
    await this.deps.authz.assertRole(parentId, 'parent');
    const child = await this.assertOwnedMinor(parentId, childId);
    await this.deps.usersService.deletePhoto(childId);
    await this.deps.audit.write({
      action: 'child.updated',
      actorUserId: parentId,
      entityType: 'user',
      entityId: childId,
      meta: { name: child.name, field: 'photo', change: 'removed' },
      ip,
    });
    return this.toDto({ ...child, photoKey: null });
  }

  async getChildSportsProfile(parentId: string, childId: string): Promise<ProfileDto> {
    await this.deps.authz.assertRole(parentId, 'parent');
    await this.assertOwned(parentId, childId);
    return this.deps.usersService.getProfile(childId);
  }

  async childFixtures(parentId: string, childId: string): Promise<ChildFixtureEntryDto[]> {
    await this.deps.authz.assertRole(parentId, 'parent');
    await this.assertOwned(parentId, childId);

    const teamIds = await this.deps.teams.listAcceptedTeamIdsForUser(childId);
    if (teamIds.length === 0) return [];
    const teamIdSet = new Set(teamIds);

    const fixtures = await this.deps.fixtures.listForTeamIds(teamIds);
    const results = await this.deps.results.findByFixtureIds(fixtures.map((f) => f.id));
    const resultByFixtureId = new Map(results.map((r) => [r.fixtureId, r]));

    return fixtures.map((f): ChildFixtureEntryDto => {
      const perspective = teamIdSet.has(f.homeTeamId) ? f.homeTeamName : f.awayTeamName;
      const result = resultByFixtureId.get(f.id);
      const winnerName =
        result?.winnerTeamId === f.homeTeamId
          ? f.homeTeamName
          : result?.winnerTeamId === f.awayTeamId
            ? f.awayTeamName
            : null;
      return {
        fixture: {
          id: f.id,
          homeTeam: f.homeTeamName,
          awayTeam: f.awayTeamName,
          ground: f.groundName,
          startsAt: f.startsAt.toISOString(),
          durationMinutes: f.durationMinutes,
          result: result
            ? {
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                winnerTeam: winnerName,
                homeRunsTotal: result.homeRunsTotal,
                awayRunsTotal: result.awayRunsTotal,
                homePlayerScores: result.playerScores
                  .filter((p) => p.teamId === f.homeTeamId)
                  .map((p) => ({
                    userId: p.userId,
                    playerName: p.playerName,
                    runs: p.runs,
                    wickets: p.wickets,
                  })),
                awayPlayerScores: result.playerScores
                  .filter((p) => p.teamId === f.awayTeamId)
                  .map((p) => ({
                    userId: p.userId,
                    playerName: p.playerName,
                    runs: p.runs,
                    wickets: p.wickets,
                  })),
              }
            : null,
        },
        tournamentName: f.tournamentName,
        perspective,
      };
    });
  }

  async updateChildSportsProfile(
    parentId: string,
    childId: string,
    input: SportsProfileInput,
    ip?: string,
  ): Promise<ProfileDto> {
    await this.deps.authz.assertRole(parentId, 'parent');
    await this.assertOwnedMinor(parentId, childId);

    return this.deps.usersService.applySportsProfile(
      childId,
      parentId,
      input,
      async (_child, db) => {
        await this.deps.audit.write(
          {
            action: 'child.updated',
            actorUserId: parentId,
            entityType: 'user',
            entityId: childId,
            ip,
          },
          db,
        );
      },
    );
  }
}
