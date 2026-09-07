import type {
  AgeGroup,
  Announcement,
  EmailStatus,
  Notification,
  OneTimeToken,
  OneTimeTokenType,
  RefreshToken,
  AssignmentStatus,
  BookingStatus,
  SurfaceType,
  TeamRole,
  TeamRosterStatus,
  TournamentInvitationStatus,
  TournamentStatus,
  User,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { RoleName } from '@nforce/shared';
import type { IncrementResponse, Store as RateLimitStore } from 'express-rate-limit';
import type { EmailAdapter, EmailSendResult } from '../../src/adapters/email/EmailAdapter';
import type { StorageAdapter } from '../../src/adapters/storage/StorageAdapter';
import type { TxRunner } from '../../src/lib/db';
import { ConflictError, NotFoundError } from '../../src/lib/errors';
import type { AgeGroupRepoPort, AgeGroupWrite } from '../../src/modules/ageGroups/ageGroup.repo';
import type {
  SurfaceTypeRepoPort,
  SurfaceTypeWrite,
} from '../../src/modules/surfaceTypes/surfaceType.repo';
import type { AuditEntry, AuditPort } from '../../src/modules/audit/audit.service';
import type {
  FixtureRepoPort,
  FixtureRow,
  FixtureWrite,
  RegisteredTeam,
} from '../../src/modules/fixtures/fixture.repo';
import type {
  AcceptedSlot,
  UmpireAssignmentRepoPort,
  UmpireScheduleRow,
} from '../../src/modules/fixtures/umpireAssignment.repo';
import type {
  BookingRepoPort,
  BookingRow,
  BookingWrite,
} from '../../src/modules/grounds/booking.repo';
import type {
  GroundRepoPort,
  GroundRow,
  GroundSearchResult,
  GroundWrite,
} from '../../src/modules/grounds/ground.repo';
import type {
  FamilyRegistrationRow,
  RegistrationEligibilityInfo,
  RegistrationEntity,
  RegistrationPaymentRow,
  RegistrationRepoPort,
  RegistrationRow,
} from '../../src/modules/registrations/registration.repo';
import type {
  PlayerProfileRepoPort,
  PlayerTeamTournament,
  PublicPlayerRow,
  TeamOutcome,
} from '../../src/modules/players/playerProfile.repo';
import type {
  FixtureResultContext,
  PlayerInningsScoreRow,
  ResultData,
  ResultOutcome,
  ResultRepoPort,
  StandingRow,
} from '../../src/modules/results/result.repo';
import type {
  TournamentInvitationRepoPort,
  TournamentInvitationRow,
} from '../../src/modules/registrations/tournamentInvitation.repo';
import type {
  ExternalInviteClaimResult,
  ExternalInviteRepoPort,
  ExternalInviteRow,
} from '../../src/modules/registrations/externalInvite.repo';
import type {
  RoleRequestRepoPort,
  RoleRequestRow,
} from '../../src/modules/users-auth/roleRequest.repo';
import type {
  ContactMessageRepoPort,
  ContactMessageRow,
} from '../../src/modules/contact/contact.repo';
import type { MyInvitationRow, TeamRepoPort, TeamRow } from '../../src/modules/teams/team.repo';
import type {
  OrganizerTournamentAgeGroupRow,
  OrganizerTournamentRepoPort,
  OrganizerTournamentRow,
  TournamentAgeGroupWrite,
  TournamentCreateWrite,
  TournamentUpdateWrite,
} from '../../src/modules/tournaments/organizerTournament.repo';
import type { AnnouncementRepoPort } from '../../src/modules/notifications/announcement.service';
import type {
  NewNotification,
  NotificationRepoPort,
} from '../../src/modules/notifications/notification.repo';
import type {
  TournamentDetailRow,
  TournamentRepoPort,
  TournamentSummaryRow,
} from '../../src/modules/tournaments/tournament.repo';
import type {
  ConsumeResult,
  OneTimeTokenRepoPort,
} from '../../src/modules/users-auth/oneTimeToken.repo';
import type {
  NewRefreshToken,
  RefreshTokenRepoPort,
} from '../../src/modules/users-auth/refreshToken.repo';
import type {
  ManagedChildWithParent,
  SportsProfileUpdateData,
  UserDirectoryEntry,
  UserRepoPort,
} from '../../src/modules/users-auth/user.repo';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import { ParentService } from '../../src/modules/parents/parent.service';

const ROLE_BY_ID: Record<number, RoleName> = {
  1: 'platform_admin',
  2: 'organizer',
  3: 'player',
  4: 'team_manager',
  5: 'ground_owner',
  6: 'umpire',
  7: 'parent',
};

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export class FakeUserRepo implements UserRepoPort {
  users = new Map<string, User>();
  roles = new Map<string, RoleName[]>();
  teamRosterForJerseyCheck: {
    teamId: string;
    teamName: string;
    userId: string;
    status: TeamRosterStatus;
  }[] = [];

  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    roleIds: number[];
    dateOfBirth?: Date;
    managedByParentId?: string;
  }): Promise<User> {
    if (await this.findByEmail(data.email)) {
      throw new ConflictError('This email address is already in use.', 'EMAIL_IN_USE');
    }
    const user: User = {
      id: nextId('user'),
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      verified: false,
      dateOfBirth: data.dateOfBirth ?? null,
      photoKey: null,
      passwordChangedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      managedByParentId: data.managedByParentId ?? null,
      claimInviteSentAt: null,
      pendingClaimEmail: null,
      pendingEmail: null,
      clubId: null,
      academyName: null,
      state: null,
      notifyPublishStates: [],
      phone: null,
      school: null,
      jerseyNumber: null,
      jerseyName: null,
      jerseySize: null,
      battingStyle: null,
      battingStyleOther: null,
      bowlingStyle: null,
      bowlingStyleOther: null,
      playingRole: null,
      heightValue: null,
      heightUnit: null,
      weightValue: null,
      weightUnit: null,
      gender: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      consentAcceptedAt: null,
      consentedByUserId: null,
    };
    this.users.set(user.id, user);
    this.roles.set(
      user.id,
      data.roleIds.map((id) => ROLE_BY_ID[id]).filter((r): r is RoleName => r !== undefined),
    );
    return user;
  }

  async setVerified(userId: string): Promise<void> {
    const u = this.users.get(userId);
    if (u) u.verified = true;
  }

  async updateProfile(
    userId: string,
    data: {
      name: string;
      dateOfBirth: Date | null;
      academyName: string | null;
      state: string | null;
    },
  ): Promise<User> {
    const u = this.users.get(userId);
    if (!u) throw new NotFoundError('User not found');
    u.name = data.name;
    u.dateOfBirth = data.dateOfBirth;
    u.academyName = data.academyName;
    u.state = data.state;
    return u;
  }

  async updateNotifyPublishStates(userId: string, states: string[]): Promise<User> {
    const u = this.users.get(userId);
    if (!u) throw new NotFoundError('User not found');
    u.notifyPublishStates = states;
    return u;
  }

  async setPhotoKey(userId: string, photoKey: string | null): Promise<User> {
    const u = this.users.get(userId);
    if (!u) throw new NotFoundError('User not found');
    u.photoKey = photoKey;
    return u;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const u = this.users.get(userId);
    if (u) {
      u.passwordHash = passwordHash;
      u.passwordChangedAt = new Date();
    }
  }

  async getRoleNames(userId: string): Promise<RoleName[]> {
    return this.roles.get(userId) ?? [];
  }

  async setClubId(userId: string, clubId: string | null): Promise<User> {
    const u = this.users.get(userId);
    if (!u) throw new NotFoundError('User not found');
    if (
      clubId &&
      [...this.users.values()].some((other) => other.id !== userId && other.clubId === clubId)
    ) {
      const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      throw err;
    }
    u.clubId = clubId;
    return u;
  }

  async listWithRoles(): Promise<{ user: User; roles: RoleName[] }[]> {
    return [...this.users.values()].map((user) => ({
      user,
      roles: this.roles.get(user.id) ?? [],
    }));
  }

  async listIds(role?: RoleName): Promise<string[]> {
    if (!role) return [...this.users.keys()];
    return [...this.users.keys()].filter((id) => (this.roles.get(id) ?? []).includes(role));
  }

  async listIdsByRoleAndState(role: RoleName, state: string): Promise<string[]> {
    return [...this.users.values()]
      .filter((u) => u.state === state && (this.roles.get(u.id) ?? []).includes(role))
      .map((u) => u.id);
  }

  async listIdsSubscribedToPublishState(role: RoleName, state: string): Promise<string[]> {
    return [...this.users.values()]
      .filter(
        (u) => u.notifyPublishStates.includes(state) && (this.roles.get(u.id) ?? []).includes(role),
      )
      .map((u) => u.id);
  }

  async listDirectoryByRole(role: RoleName): Promise<UserDirectoryEntry[]> {
    return [...this.users.values()]
      .filter((u) => (this.roles.get(u.id) ?? []).includes(role))
      .map((u) => ({ id: u.id, name: u.name, email: u.email, verified: u.verified }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async searchPlayersByName(
    query: string,
  ): Promise<{ id: string; name: string; managedByParentName: string | null }[]> {
    return [...this.users.values()]
      .filter(
        (u) =>
          (this.roles.get(u.id) ?? []).includes('player') &&
          u.name.toLowerCase().includes(query.toLowerCase()),
      )
      .map((u) => ({
        id: u.id,
        name: u.name,
        managedByParentName: u.managedByParentId
          ? (this.users.get(u.managedByParentId)?.name ?? null)
          : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async addRole(userId: string, roleId: number): Promise<void> {
    const name = ROLE_BY_ID[roleId];
    if (!name) return;
    const current = this.roles.get(userId) ?? [];
    if (!current.includes(name)) this.roles.set(userId, [...current, name]);
  }

  async removeRole(userId: string, roleId: number): Promise<void> {
    const name = ROLE_BY_ID[roleId];
    const current = this.roles.get(userId) ?? [];
    this.roles.set(
      userId,
      current.filter((r) => r !== name),
    );
  }

  async listManagedChildren(parentId: string): Promise<User[]> {
    return [...this.users.values()]
      .filter((u) => u.managedByParentId === parentId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listAllManagedChildren(): Promise<ManagedChildWithParent[]> {
    return [...this.users.values()]
      .filter((u) => u.managedByParentId != null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((u) => {
        const parent = this.users.get(u.managedByParentId!) ?? null;
        return {
          ...u,
          parent: parent ? { id: parent.id, name: parent.name, email: parent.email } : null,
        };
      });
  }

  async updateChild(childId: string, data: { name: string; dateOfBirth: Date }): Promise<User> {
    const u = this.users.get(childId);
    if (!u) throw new NotFoundError('User not found');
    u.name = data.name;
    u.dateOfBirth = data.dateOfBirth;
    return u;
  }

  async setClaimInviteSentAt(
    childId: string,
    data: { at: Date; pendingClaimEmail: string },
  ): Promise<void> {
    const u = this.users.get(childId);
    if (u) {
      u.claimInviteSentAt = data.at;
      u.pendingClaimEmail = data.pendingClaimEmail;
    }
  }

  async claimAccount(
    childId: string,
    data: { email: string; passwordHash: string },
  ): Promise<User> {
    const u = this.users.get(childId);
    if (!u) throw new NotFoundError('User not found');
    u.email = data.email;
    u.passwordHash = data.passwordHash;
    u.verified = true;
    u.managedByParentId = null;
    u.pendingClaimEmail = null;
    return u;
  }

  async setPendingEmail(userId: string, email: string): Promise<void> {
    const u = this.users.get(userId);
    if (u) u.pendingEmail = email;
  }

  async confirmEmailChange(userId: string, newEmail: string): Promise<User> {
    const u = this.users.get(userId);
    if (!u) throw new NotFoundError('User not found');
    u.email = newEmail;
    u.verified = true;
    u.pendingEmail = null;
    return u;
  }

  async updateSportsProfile(userId: string, data: SportsProfileUpdateData): Promise<User> {
    const u = this.users.get(userId);
    if (!u) throw new NotFoundError('User not found');
    Object.assign(u, data);
    return u;
  }

  async findTeammateWithJerseyNumber(
    userId: string,
    jerseyNumber: number,
  ): Promise<{ teamName: string } | null> {
    const myTeamIds = new Set(
      this.teamRosterForJerseyCheck
        .filter((r) => r.userId === userId && r.status === 'accepted')
        .map((r) => r.teamId),
    );
    if (myTeamIds.size === 0) return null;
    for (const row of this.teamRosterForJerseyCheck) {
      if (row.userId === userId || row.status !== 'accepted' || !myTeamIds.has(row.teamId))
        continue;
      const teammate = this.users.get(row.userId);
      if (teammate?.jerseyNumber === jerseyNumber) return { teamName: row.teamName };
    }
    return null;
  }
}

export class FakeRefreshTokenRepo implements RefreshTokenRepoPort {
  rows = new Map<string, RefreshToken>();

  private materialize(data: NewRefreshToken): RefreshToken {
    return {
      id: nextId('rt'),
      userId: data.userId,
      familyId: data.familyId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      rotatedAt: null,
      revokedAt: null,
      replacedById: null,
      userAgent: data.userAgent ?? null,
      ip: data.ip ?? null,
      createdAt: new Date(),
    };
  }

  async create(data: NewRefreshToken): Promise<RefreshToken> {
    const row = this.materialize(data);
    this.rows.set(row.id, row);
    return row;
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return [...this.rows.values()].find((r) => r.tokenHash === tokenHash) ?? null;
  }

  async rotate(oldId: string, next: NewRefreshToken): Promise<RefreshToken | null> {
    const old = this.rows.get(oldId);
    if (!old || old.rotatedAt || old.revokedAt) return null;
    old.rotatedAt = new Date();
    const successor = await this.create(next);
    old.replacedById = successor.id;
    return successor;
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.familyId === familyId && !row.revokedAt) row.revokedAt = new Date();
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.userId === userId && !row.revokedAt) row.revokedAt = new Date();
    }
  }

  activeCountFor(userId: string): number {
    return [...this.rows.values()].filter((r) => r.userId === userId && !r.revokedAt).length;
  }
}

export class FakeOneTimeTokenRepo implements OneTimeTokenRepoPort {
  rows = new Map<string, OneTimeToken>();

  async issue(data: {
    userId: string;
    type: OneTimeTokenType;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.userId === data.userId && row.type === data.type && !row.consumedAt) {
        row.consumedAt = new Date();
      }
    }
    this.rows.set(data.tokenHash, {
      id: nextId('ott'),
      userId: data.userId,
      type: data.type,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    });
  }

  async consume(tokenHash: string, type: OneTimeTokenType): Promise<ConsumeResult> {
    const row = this.rows.get(tokenHash);
    if (!row || row.type !== type) return { outcome: 'invalid' };
    if (row.consumedAt) return { outcome: 'used' };
    if (row.expiresAt <= new Date()) return { outcome: 'expired' };
    row.consumedAt = new Date();
    return { outcome: 'consumed', userId: row.userId };
  }
}

export class FakeExternalInviteRepo implements ExternalInviteRepoPort {
  rows = new Map<string, ExternalInviteRow>();
  private byTokenHash = new Map<string, string>();
  tournamentNames = new Map<string, string>();

  async findPending(
    email: string,
    role: ExternalInviteRow['role'],
    tournamentAgeGroupId: string | null,
  ): Promise<ExternalInviteRow | null> {
    for (const row of this.rows.values()) {
      if (
        row.email === email &&
        row.role === role &&
        row.tournamentAgeGroupId === tournamentAgeGroupId &&
        row.status === 'pending'
      ) {
        return row;
      }
    }
    return null;
  }

  async create(data: {
    email: string;
    role: ExternalInviteRow['role'];
    tournamentId: string | null;
    tournamentAgeGroupId: string | null;
    invitedByOrganizerId: string;
    tokenHash: string;
    expiresAt: Date;
    status?: ExternalInviteRow['status'];
    claimedByUserId?: string | null;
  }): Promise<ExternalInviteRow> {
    const row: ExternalInviteRow = {
      id: nextId('ext-invite'),
      email: data.email,
      role: data.role,
      tournamentId: data.tournamentId,
      tournamentName: data.tournamentId
        ? (this.tournamentNames.get(data.tournamentId) ?? null)
        : null,
      tournamentAgeGroupId: data.tournamentAgeGroupId,
      ageGroupLabel: null,
      invitedByOrganizerId: data.invitedByOrganizerId,
      status: data.status ?? 'pending',
      claimedByUserId: data.claimedByUserId ?? null,
      teamInviteFiredAt: null,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    this.byTokenHash.set(data.tokenHash, row.id);
    return row;
  }

  async reissue(
    id: string,
    data: { tokenHash: string; expiresAt: Date },
  ): Promise<ExternalInviteRow> {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError('Invite not found');
    for (const [hash, rowId] of this.byTokenHash) {
      if (rowId === id) this.byTokenHash.delete(hash);
    }
    row.expiresAt = data.expiresAt;
    this.byTokenHash.set(data.tokenHash, id);
    return row;
  }

  async findByTokenHash(tokenHash: string): Promise<ExternalInviteRow | null> {
    const id = this.byTokenHash.get(tokenHash);
    return id ? (this.rows.get(id) ?? null) : null;
  }

  async claim(tokenHash: string): Promise<ExternalInviteClaimResult> {
    const id = this.byTokenHash.get(tokenHash);
    if (!id) return { outcome: 'invalid' };
    const row = this.rows.get(id);
    if (!row) return { outcome: 'invalid' };
    if (row.status === 'fulfilled') return { outcome: 'used' };
    if (row.expiresAt <= new Date()) return { outcome: 'expired' };
    row.status = 'fulfilled';
    return {
      outcome: 'claimed',
      invite: {
        id: row.id,
        email: row.email,
        role: row.role,
        tournamentId: row.tournamentId,
        tournamentName: row.tournamentName,
        tournamentAgeGroupId: row.tournamentAgeGroupId,
        invitedByOrganizerId: row.invitedByOrganizerId,
      },
    };
  }

  async recordClaimedBy(id: string, userId: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.claimedByUserId = userId;
  }

  async listForTournament(tournamentId: string): Promise<ExternalInviteRow[]> {
    return [...this.rows.values()].filter((r) => r.tournamentId === tournamentId);
  }

  async findUnconsumedTeamManagerInvites(userId: string): Promise<ExternalInviteRow[]> {
    return [...this.rows.values()]
      .filter(
        (r) =>
          r.claimedByUserId === userId &&
          r.role === 'team_manager' &&
          r.status === 'fulfilled' &&
          r.tournamentId != null &&
          r.tournamentAgeGroupId != null &&
          r.teamInviteFiredAt == null,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async markTeamInviteFired(id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.teamInviteFiredAt = new Date();
  }
}

export class FakeAudit implements AuditPort {
  entries: AuditEntry[] = [];

  async write(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  actionsOf(action: string): AuditEntry[] {
    return this.entries.filter((e) => e.action === action);
  }
}

export class FakeStorageAdapter implements StorageAdapter {
  objects = new Map<string, { bytes: Buffer; contentType: string }>();

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { bytes, contentType });
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    return `https://files.test/${key}?exp=${Math.floor(Date.now() / 1000) + ttlSeconds}&sig=fake`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

export class MailboxAdapter implements EmailAdapter {
  verifications: { to: string; name: string; verifyUrl: string }[] = [];
  resets: { to: string; name: string; resetUrl: string }[] = [];
  claims: { to: string; childName: string; claimUrl: string }[] = [];
  emailChanges: { to: string; name: string; confirmUrl: string }[] = [];
  externalInvites: {
    to: string;
    role: 'player' | 'team_manager';
    organizerName: string;
    organizerAcademyName: string | null;
    signupUrl: string;
    tournament: {
      name: string;
      structureLabel: string;
      ageGroupLabel: string;
      formatLabel: string;
      dateRange: string;
      location: string | null;
      entryFee: number | null;
    };
  }[] = [];
  notifications: {
    to: string;
    subject: string;
    body: string;
    infoCard?: { title: string; rows: { label: string; value: string }[] };
  }[] = [];
  failNext = false;
  rejectNext = false;

  private gate(): void {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('simulated email provider outage');
    }
  }

  async sendVerificationEmail(p: { to: string; name: string; verifyUrl: string }): Promise<void> {
    this.gate();
    this.verifications.push(p);
  }

  async sendPasswordResetEmail(p: { to: string; name: string; resetUrl: string }): Promise<void> {
    this.gate();
    this.resets.push(p);
  }

  async sendAccountClaimEmail(p: {
    to: string;
    childName: string;
    claimUrl: string;
  }): Promise<void> {
    this.gate();
    this.claims.push(p);
  }

  async sendEmailChangeEmail(p: { to: string; name: string; confirmUrl: string }): Promise<void> {
    this.gate();
    this.emailChanges.push(p);
  }

  async sendExternalInviteEmail(p: {
    to: string;
    role: 'player' | 'team_manager';
    organizerName: string;
    organizerAcademyName: string | null;
    signupUrl: string;
    tournament: {
      name: string;
      structureLabel: string;
      ageGroupLabel: string;
      formatLabel: string;
      dateRange: string;
      location: string | null;
      entryFee: number | null;
    };
  }): Promise<void> {
    this.gate();
    this.externalInvites.push(p);
  }

  async sendNotificationEmail(p: {
    to: string;
    subject: string;
    body: string;
    infoCard?: { title: string; rows: { label: string; value: string }[] };
  }): Promise<EmailSendResult> {
    this.gate();
    if (this.rejectNext) {
      this.rejectNext = false;
      return { ok: false, reason: 'simulated provider rejection' };
    }
    this.notifications.push(p);
    return { ok: true };
  }
}

export class FakeAdminVerificationSender {
  calls: string[] = [];
  verifiedUserIds = new Set<string>();

  async sendVerificationEmailForAdmin(userId: string): Promise<void> {
    if (this.verifiedUserIds.has(userId)) {
      throw new ConflictError('This account is already verified.', 'ALREADY_VERIFIED');
    }
    this.calls.push(userId);
  }
}

export class FakeNotificationRepo implements NotificationRepoPort {
  rows = new Map<string, Notification>();

  async create(data: NewNotification): Promise<Notification> {
    const row: Notification = {
      id: nextId('ntf'),
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      payload: (data.payload ?? {}) as Notification['payload'],
      emailStatus: 'skipped',
      readAt: null,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async setEmailStatus(id: string, status: EmailStatus): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.emailStatus = status;
  }

  async listForUser(userId: string, limit = 200): Promise<Notification[]> {
    return [...this.rows.values()].filter((r) => r.userId === userId).slice(0, limit);
  }

  async countUnread(userId: string): Promise<number> {
    return [...this.rows.values()].filter((r) => r.userId === userId && !r.readAt).length;
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return false;
    row.readAt ??= new Date();
    return true;
  }

  async markUnread(userId: string, id: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return false;
    row.readAt = null;
    return true;
  }

  async markAllRead(userId: string): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.userId === userId && !row.readAt) row.readAt = new Date();
    }
  }

  forUser(userId: string): Notification[] {
    return [...this.rows.values()].filter((r) => r.userId === userId);
  }
}

export class FakeAnnouncementRepo implements AnnouncementRepoPort {
  rows: Announcement[] = [];

  async create(data: {
    title: string;
    body: string;
    targetRoles: string[];
    createdById: string;
  }): Promise<Announcement> {
    const row: Announcement = {
      id: nextId('ann'),
      title: data.title,
      body: data.body,
      targetRoles: data.targetRoles as Announcement['targetRoles'],
      createdById: data.createdById,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
}

export class FakeAgeGroupRepo implements AgeGroupRepoPort {
  rows = new Map<string, AgeGroup>();

  async listVisibleTo(organizerId: string): Promise<AgeGroup[]> {
    return [...this.rows.values()]
      .filter((r) => !r.hidden && (r.organizerId === null || r.organizerId === organizerId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<AgeGroup | null> {
    return this.rows.get(id) ?? null;
  }

  async create(data: AgeGroupWrite): Promise<AgeGroup> {
    if ([...this.rows.values()].some((r) => r.name === data.name)) {
      throw new ConflictError('An age group with this name already exists.', 'AGE_GROUP_EXISTS');
    }
    const row: AgeGroup = {
      id: nextId('age'),
      name: data.name,
      minAge: null,
      maxAge: null,
      organizerId: data.organizerId,
      hidden: false,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async setHidden(id: string, hidden: boolean): Promise<AgeGroup> {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError('Age group not found');
    const updated = { ...row, hidden };
    this.rows.set(id, updated);
    return updated;
  }
}

export class FakeSurfaceTypeRepo implements SurfaceTypeRepoPort {
  rows = new Map<string, SurfaceType>();
  referencedByTournament = new Set<string>();

  async listVisibleTo(organizerId: string): Promise<SurfaceType[]> {
    return [...this.rows.values()]
      .filter((r) => r.organizerId === null || r.organizerId === organizerId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<SurfaceType | null> {
    return this.rows.get(id) ?? null;
  }

  async create(data: SurfaceTypeWrite): Promise<SurfaceType> {
    if ([...this.rows.values()].some((r) => r.name === data.name)) {
      throw new ConflictError(
        'A surface type with this name already exists.',
        'SURFACE_TYPE_EXISTS',
      );
    }
    const row: SurfaceType = {
      id: nextId('surface'),
      name: data.name,
      organizerId: data.organizerId,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async delete(id: string): Promise<void> {
    if (!this.rows.has(id)) throw new NotFoundError('Surface type not found');
    if (this.referencedByTournament.has(id)) {
      throw new ConflictError(
        "This surface type is used by an existing tournament and can't be deleted.",
        'SURFACE_TYPE_IN_USE',
      );
    }
    this.rows.delete(id);
  }
}

export class FakeOrganizerTournamentRepo implements OrganizerTournamentRepoPort {
  rows = new Map<string, OrganizerTournamentRow>();
  ageGroupNames: Record<string, string> = { 'age-open': 'Open' };

  private buildAgeGroups(writes: TournamentAgeGroupWrite[]): OrganizerTournamentAgeGroupRow[] {
    return writes.map((w) => ({
      id: nextId('tag'),
      ageGroupId: w.ageGroupId,
      name: this.ageGroupNames[w.ageGroupId] ?? 'Open',
      bornAfter: w.bornAfter,
      bornBefore: w.bornBefore,
      genderCategory: w.genderCategory,
      registrationStartDate: w.registrationStartDate,
      registrationEndDate: w.registrationEndDate,
      capacity: w.capacity,
      format: w.format,
      entryFee: w.entryFee,
      oversPerInnings: w.oversPerInnings,
      registeredCount: 0,
    }));
  }

  async create(
    organizerId: string,
    data: Partial<TournamentCreateWrite> &
      Pick<TournamentCreateWrite, 'name' | 'startDate' | 'endDate'>,
  ): Promise<OrganizerTournamentRow> {
    const ageGroups: TournamentAgeGroupWrite[] = data.ageGroups ?? [
      {
        ageGroupId: 'age-open',
        bornAfter: null,
        bornBefore: null,
        genderCategory: 'mixed',
        registrationStartDate: data.startDate,
        registrationEndDate: data.endDate,
        capacity: null,
        format: 'T20',
        entryFee: null,
        oversPerInnings: null,
      },
    ];
    const row: OrganizerTournamentRow = {
      id: nextId('tournament'),
      name: data.name,
      description: data.description ?? null,
      structure: data.structure ?? 'round_robin',
      teamSelectionMode: data.teamSelectionMode ?? 'prebuilt_rosters',
      ageGroups: this.buildAgeGroups(ageGroups),
      startDate: data.startDate,
      endDate: data.endDate,
      capacity: data.capacity ?? null,
      rules: data.rules ?? null,
      rulesDocumentKey: data.rulesDocumentKey ?? null,
      prizePoolAmount: data.prizePoolAmount ?? null,
      prizePoolDescription: data.prizePoolDescription ?? null,
      locationCity: data.locationCity ?? null,
      locationState: data.locationState ?? null,
      surfaceTypeId: data.surfaceTypeId ?? null,
      maxMarqueePlayers: data.maxMarqueePlayers ?? null,
      notifyOnPublish: data.notifyOnPublish ?? false,
      notifyAudiences: data.notifyAudiences ?? ['everyone'],
      notifyState: data.notifyState ?? null,
      registeredCount: 0,
      notifiedAt: null,
      status: 'draft',
      organizerId,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(id: string): Promise<OrganizerTournamentRow | null> {
    return this.rows.get(id) ?? null;
  }

  async listByOrganizer(organizerId: string): Promise<OrganizerTournamentRow[]> {
    return [...this.rows.values()].filter((r) => r.organizerId === organizerId);
  }

  async update(id: string, data: TournamentUpdateWrite): Promise<OrganizerTournamentRow> {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError('Tournament not found');
    const { ageGroups, ...scalars } = data;
    const updated: OrganizerTournamentRow = {
      ...row,
      ...scalars,
      ageGroups: ageGroups ? this.buildAgeGroups(ageGroups) : row.ageGroups,
    };
    this.rows.set(id, updated);
    return updated;
  }

  async updateStatus(id: string, status: TournamentStatus): Promise<OrganizerTournamentRow> {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError('Tournament not found');
    const updated = { ...row, status };
    this.rows.set(id, updated);
    return updated;
  }

  async markNotified(id: string): Promise<OrganizerTournamentRow> {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError('Tournament not found');
    const updated = { ...row, notifiedAt: new Date() };
    this.rows.set(id, updated);
    return updated;
  }

  async setRulesDocumentKey(id: string, key: string | null): Promise<OrganizerTournamentRow> {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError('Tournament not found');
    const updated = { ...row, rulesDocumentKey: key };
    this.rows.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    if (!this.rows.has(id)) throw new NotFoundError('Tournament not found');
    this.rows.delete(id);
  }
}

export class FakeTeamRepo implements TeamRepoPort {
  teams = new Map<
    string,
    {
      id: string;
      name: string;
      managerId: string;
      managerName: string;
      managerAcademyName: string | null;
      draftTournamentAgeGroupId: string | null;
    }
  >();
  roster = new Map<
    string,
    {
      userId: string;
      name: string;
      email: string;
      isManagedChild: boolean;
      managedByParentName: string | null;
      roleInTeam: TeamRole;
      status: TeamRosterStatus;
      joinedAt: Date;
    }[]
  >();

  constructor(private readonly users?: Pick<FakeUserRepo, 'findById'>) {}

  private async resolveManaged(
    userId: string,
  ): Promise<{ isManagedChild: boolean; managedByParentName: string | null }> {
    const user = await this.users?.findById(userId);
    if (!user?.managedByParentId) return { isManagedChild: false, managedByParentName: null };
    const parent = await this.users?.findById(user.managedByParentId);
    return { isManagedChild: true, managedByParentName: parent?.name ?? null };
  }

  private materialize(id: string): TeamRow {
    const t = this.teams.get(id)!;
    return {
      id: t.id,
      name: t.name,
      managerId: t.managerId,
      managerName: t.managerName,
      managerAcademyName: t.managerAcademyName,
      draftTournamentAgeGroupId: t.draftTournamentAgeGroupId,
      roster: this.roster.get(id) ?? [],
    };
  }

  async create(managerId: string, name: string): Promise<TeamRow> {
    const id = nextId('team');
    const manager = await this.users?.findById(managerId);
    this.teams.set(id, {
      id,
      name,
      managerId,
      managerName: manager?.name ?? 'Manager',
      managerAcademyName: manager?.academyName ?? null,
      draftTournamentAgeGroupId: null,
    });
    this.roster.set(id, []);
    return this.materialize(id);
  }

  async createDraft(
    managerId: string,
    name: string,
    tournamentAgeGroupId: string,
  ): Promise<TeamRow> {
    const row = await this.create(managerId, name);
    this.teams.get(row.id)!.draftTournamentAgeGroupId = tournamentAgeGroupId;
    return this.materialize(row.id);
  }

  async listDraftTeamsForAgeGroup(tournamentAgeGroupId: string): Promise<TeamRow[]> {
    return [...this.teams.values()]
      .filter((t) => t.draftTournamentAgeGroupId === tournamentAgeGroupId)
      .map((t) => this.materialize(t.id));
  }

  async findById(id: string): Promise<TeamRow | null> {
    return this.teams.has(id) ? this.materialize(id) : null;
  }

  async listByManager(managerId: string): Promise<TeamRow[]> {
    return [...this.teams.values()]
      .filter((t) => t.managerId === managerId)
      .map((t) => this.materialize(t.id));
  }

  async update(id: string, name: string): Promise<TeamRow> {
    const t = this.teams.get(id);
    if (!t) throw new NotFoundError('Team not found');
    t.name = name;
    return this.materialize(id);
  }

  async addRosterEntry(teamId: string, userId: string, roleInTeam: TeamRole): Promise<void> {
    const list = this.roster.get(teamId) ?? [];
    const existing = list.find((r) => r.userId === userId);
    if (existing) {
      if (existing.status !== 'declined') {
        throw new ConflictError('This player is already on the roster.', 'ALREADY_ON_ROSTER');
      }
      existing.roleInTeam = roleInTeam;
      existing.status = 'invited';
      existing.joinedAt = new Date();
      return;
    }
    const user = await this.users?.findById(userId);
    list.push({
      userId,
      name: user?.name ?? 'Player',
      email: user?.email ?? `${userId}@example.com`,
      ...(await this.resolveManaged(userId)),
      roleInTeam,
      status: 'invited',
      joinedAt: new Date(),
    });
    this.roster.set(teamId, list);
  }

  async addAcceptedRosterEntry(
    teamId: string,
    userId: string,
    roleInTeam: TeamRole,
  ): Promise<void> {
    const list = this.roster.get(teamId) ?? [];
    if (list.some((r) => r.userId === userId)) {
      throw new ConflictError('This player is already on the roster.', 'ALREADY_ON_ROSTER');
    }
    const user = await this.users?.findById(userId);
    list.push({
      userId,
      name: user?.name ?? 'Player',
      email: user?.email ?? `${userId}@example.com`,
      ...(await this.resolveManaged(userId)),
      roleInTeam,
      status: 'accepted',
      joinedAt: new Date(),
    });
    this.roster.set(teamId, list);
  }

  async requestToJoin(teamId: string, userId: string, roleInTeam: TeamRole): Promise<void> {
    const list = this.roster.get(teamId) ?? [];
    const existing = list.find((r) => r.userId === userId);
    if (existing) {
      if (existing.status !== 'declined') {
        throw new ConflictError('This player is already on the roster.', 'ALREADY_ON_ROSTER');
      }
      existing.roleInTeam = roleInTeam;
      existing.status = 'requested';
      existing.joinedAt = new Date();
      return;
    }
    const user = await this.users?.findById(userId);
    list.push({
      userId,
      name: user?.name ?? 'Player',
      email: user?.email ?? `${userId}@example.com`,
      ...(await this.resolveManaged(userId)),
      roleInTeam,
      status: 'requested',
      joinedAt: new Date(),
    });
    this.roster.set(teamId, list);
  }

  async findRosterEntry(
    teamId: string,
    userId: string,
  ): Promise<{ status: TeamRosterStatus } | null> {
    const entry = (this.roster.get(teamId) ?? []).find((r) => r.userId === userId);
    return entry ? { status: entry.status } : null;
  }

  async setRosterStatus(teamId: string, userId: string, status: TeamRosterStatus): Promise<void> {
    const entry = (this.roster.get(teamId) ?? []).find((r) => r.userId === userId);
    if (entry) entry.status = status;
  }

  async removeRosterEntry(teamId: string, userId: string): Promise<void> {
    const list = this.roster.get(teamId) ?? [];
    const idx = list.findIndex((r) => r.userId === userId);
    if (idx === -1) throw new NotFoundError('Roster entry not found');
    list.splice(idx, 1);
  }

  async listInvitationsForUser(userId: string): Promise<MyInvitationRow[]> {
    const result: MyInvitationRow[] = [];
    for (const t of this.teams.values()) {
      const entry = (this.roster.get(t.id) ?? []).find(
        (r) => r.userId === userId && r.status === 'invited',
      );
      if (entry) result.push({ teamId: t.id, teamName: t.name, roleInTeam: entry.roleInTeam });
    }
    return result;
  }

  async listAcceptedTeamIdsForUser(userId: string): Promise<string[]> {
    const result: string[] = [];
    for (const t of this.teams.values()) {
      const entry = (this.roster.get(t.id) ?? []).find(
        (r) => r.userId === userId && r.status === 'accepted',
      );
      if (entry) result.push(t.id);
    }
    return result;
  }

  async searchByName(query: string): Promise<{ id: string; name: string; managerName: string }[]> {
    return [...this.teams.values()]
      .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
      .map((t) => ({ id: t.id, name: t.name, managerName: t.managerName }));
  }
}

export class FakeRegistrationRepo implements RegistrationRepoPort {
  tournamentInfo = new Map<string, RegistrationEligibilityInfo>();
  rows = new Map<string, RegistrationRow>();
  tournamentNames = new Map<string, string>();
  bracketLabels = new Map<string, string>();

  constructor(private readonly names?: { users: FakeUserRepo; teams: FakeTeamRepo }) {}

  async findTournamentInfo(tournamentId: string): Promise<RegistrationEligibilityInfo | null> {
    return this.tournamentInfo.get(tournamentId) ?? null;
  }

  async countActive(tournamentAgeGroupId: string, entityType: 'team' | 'player'): Promise<number> {
    return [...this.rows.values()].filter(
      (r) =>
        r.tournamentAgeGroupId === tournamentAgeGroupId &&
        r.status === 'active' &&
        (entityType === 'team' ? r.teamId != null : r.userId != null),
    ).length;
  }

  async create(
    tournamentId: string,
    entity: Omit<RegistrationEntity, 'tournamentAgeGroupId'> & { tournamentAgeGroupId?: string },
  ): Promise<{ id: string }> {
    const tournamentAgeGroupId = entity.tournamentAgeGroupId ?? 'tag-default';
    const activeDuplicate = [...this.rows.values()].find(
      (r) =>
        r.tournamentAgeGroupId === tournamentAgeGroupId &&
        r.status === 'active' &&
        ((entity.userId && r.userId === entity.userId) ||
          (entity.teamId && r.teamId === entity.teamId)),
    );
    if (activeDuplicate) {
      throw new ConflictError('Already registered for this category.', 'ALREADY_REGISTERED');
    }
    const id = nextId('registration');
    const entityName = entity.userId
      ? (this.names?.users.users.get(entity.userId)?.name ?? 'Player')
      : (this.names?.teams.teams.get(entity.teamId!)?.name ?? 'Team');
    this.rows.set(id, {
      id,
      tournamentId,
      tournamentAgeGroupId,
      ageGroupLabel: this.bracketLabels.get(tournamentAgeGroupId) ?? 'Age Group',
      userId: entity.userId ?? null,
      teamId: entity.teamId ?? null,
      entityName,
      status: 'active',
      createdAt: new Date(),
      capacityOverridden: entity.capacityOverridden ?? false,
      teamPaymentStatus: 'unpaid',
      teamPaymentAmountPaid: null,
    });
    return { id };
  }

  async findById(id: string): Promise<RegistrationRow | null> {
    return this.rows.get(id) ?? null;
  }

  async withdraw(id: string): Promise<void> {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError('Registration not found');
    row.status = 'withdrawn';
  }

  async listForTournament(tournamentId: string): Promise<RegistrationRow[]> {
    return [...this.rows.values()].filter((r) => r.tournamentId === tournamentId);
  }

  async listUserAndManagerIdsRegisteredInYear(
    year: number,
  ): Promise<{ userIds: string[]; managerIds: string[] }> {
    const userIds = new Set<string>();
    const managerIds = new Set<string>();
    for (const row of this.rows.values()) {
      if (row.status !== 'active') continue;
      const info = this.tournamentInfo.get(row.tournamentId);
      if (!info || info.startDate.getUTCFullYear() !== year) continue;
      if (row.userId) userIds.add(row.userId);
      if (row.teamId) {
        const managerId = this.names?.teams.teams.get(row.teamId)?.managerId;
        if (managerId) managerIds.add(managerId);
      }
    }
    return { userIds: [...userIds], managerIds: [...managerIds] };
  }

  async listActiveForUsers(userIds: string[]): Promise<FamilyRegistrationRow[]> {
    const idSet = new Set(userIds);
    return [...this.rows.values()]
      .filter((r) => r.status === 'active' && r.userId && idSet.has(r.userId))
      .map((r) => ({
        ...r,
        tournamentName: this.tournamentNames.get(r.tournamentId) ?? 'Tournament',
      }));
  }

  async findOverlappingIndividualRegistrations(
    userId: string,
    teamId: string,
  ): Promise<RegistrationRow[]> {
    const teamBracketIds = new Set(
      [...this.rows.values()]
        .filter((r) => r.teamId === teamId && r.status === 'active')
        .map((r) => r.tournamentAgeGroupId),
    );
    if (teamBracketIds.size === 0) return [];
    return [...this.rows.values()].filter(
      (r) =>
        r.userId === userId && r.status === 'active' && teamBracketIds.has(r.tournamentAgeGroupId),
    );
  }

  tournamentOrganizers = new Map<string, string>();

  async isTeamRegisteredUnderOrganizer(teamId: string, organizerId: string): Promise<boolean> {
    return [...this.rows.values()].some(
      (r) =>
        r.teamId === teamId &&
        r.status === 'active' &&
        this.tournamentOrganizers.get(r.tournamentId) === organizerId,
    );
  }

  payments = new Map<string, RegistrationPaymentRow>();

  async listPaymentsForTournament(tournamentId: string): Promise<RegistrationPaymentRow[]> {
    const registrationIds = new Set(
      [...this.rows.values()].filter((r) => r.tournamentId === tournamentId).map((r) => r.id),
    );
    return [...this.payments.values()].filter((p) => registrationIds.has(p.registrationId));
  }

  async findPayment(
    registrationId: string,
    userId: string,
  ): Promise<RegistrationPaymentRow | null> {
    return this.payments.get(`${registrationId}:${userId}`) ?? null;
  }

  async upsertPayment(
    registrationId: string,
    userId: string,
    data: { status: RegistrationPaymentRow['status']; amountPaid: number | null },
  ): Promise<void> {
    this.payments.set(`${registrationId}:${userId}`, {
      registrationId,
      userId,
      status: data.status,
      amountPaid: data.amountPaid,
    });
  }

  async updateTeamPayment(
    registrationId: string,
    data: { status: RegistrationPaymentRow['status']; amountPaid: number | null },
  ): Promise<void> {
    const row = this.rows.get(registrationId);
    if (!row) throw new NotFoundError('Registration not found');
    row.teamPaymentStatus = data.status;
    row.teamPaymentAmountPaid = data.amountPaid;
  }
}

export class FakeTournamentInvitationRepo implements TournamentInvitationRepoPort {
  rows = new Map<string, TournamentInvitationRow>();
  bracketLabels = new Map<string, string>();

  constructor(
    readonly names?: {
      tournaments: Map<string, string>;
      teams: FakeTeamRepo;
      users?: FakeUserRepo;
    },
  ) {}

  private assertNoPending(tournamentId: string, filter: (r: TournamentInvitationRow) => boolean) {
    const pending = [...this.rows.values()].find(
      (r) => r.tournamentId === tournamentId && r.status === 'invited' && filter(r),
    );
    if (pending) {
      throw new ConflictError('There is already a pending invitation.', 'INVITE_PENDING');
    }
  }

  async createForTeam(
    tournamentId: string,
    teamId: string,
    tournamentAgeGroupId: string,
    _invitedById: string,
    windowOverridden = false,
    eligibilityOverridden = false,
    capacityOverridden = false,
  ): Promise<TournamentInvitationRow> {
    this.assertNoPending(tournamentId, (r) => r.entityType === 'team' && r.entityId === teamId);
    const id = nextId('invitation');
    const row: TournamentInvitationRow = {
      id,
      tournamentId,
      tournamentName: this.names?.tournaments.get(tournamentId) ?? 'Tournament',
      entityType: 'team',
      entityId: teamId,
      entityName: this.names?.teams.teams.get(teamId)?.name ?? 'Team',
      eligibilityOverridden,
      windowOverridden,
      capacityOverridden,
      tournamentAgeGroupId,
      ageGroupLabel: this.bracketLabels.get(tournamentAgeGroupId) ?? 'Age Group',
      status: 'invited',
      createdAt: new Date(),
    };
    this.rows.set(id, row);
    return row;
  }

  async createForUser(
    tournamentId: string,
    userId: string,
    tournamentAgeGroupId: string,
    _invitedById: string,
    eligibilityOverridden: boolean,
    windowOverridden = false,
    capacityOverridden = false,
  ): Promise<TournamentInvitationRow> {
    this.assertNoPending(tournamentId, (r) => r.entityType === 'player' && r.entityId === userId);
    const id = nextId('invitation');
    const row: TournamentInvitationRow = {
      id,
      tournamentId,
      tournamentName: this.names?.tournaments.get(tournamentId) ?? 'Tournament',
      entityType: 'player',
      entityId: userId,
      entityName: this.names?.users?.users.get(userId)?.name ?? 'Player',
      eligibilityOverridden,
      windowOverridden,
      capacityOverridden,
      tournamentAgeGroupId,
      ageGroupLabel: this.bracketLabels.get(tournamentAgeGroupId) ?? 'Age Group',
      status: 'invited',
      createdAt: new Date(),
    };
    this.rows.set(id, row);
    return row;
  }

  async findById(id: string): Promise<TournamentInvitationRow | null> {
    return this.rows.get(id) ?? null;
  }

  async listForTournament(tournamentId: string): Promise<TournamentInvitationRow[]> {
    return [...this.rows.values()].filter((r) => r.tournamentId === tournamentId);
  }

  async listForTeam(teamId: string): Promise<TournamentInvitationRow[]> {
    return [...this.rows.values()].filter(
      (r) => r.entityType === 'team' && r.entityId === teamId && r.status === 'invited',
    );
  }

  async listForUser(userId: string): Promise<TournamentInvitationRow[]> {
    return [...this.rows.values()].filter(
      (r) => r.entityType === 'player' && r.entityId === userId && r.status === 'invited',
    );
  }

  async findPendingForUserAndTournament(
    userId: string,
    tournamentId: string,
  ): Promise<TournamentInvitationRow | null> {
    return (
      [...this.rows.values()].find(
        (r) =>
          r.entityType === 'player' &&
          r.entityId === userId &&
          r.tournamentId === tournamentId &&
          r.status === 'invited',
      ) ?? null
    );
  }

  async updateStatus(id: string, status: TournamentInvitationStatus): Promise<void> {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError('Invitation not found');
    row.status = status;
  }

  async claimResponse(
    id: string,
    toStatus: 'accepted' | 'declined',
  ): Promise<TournamentInvitationRow | null> {
    const row = this.rows.get(id);
    if (!row || row.status !== 'invited') return null;
    row.status = toStatus;
    return row;
  }
}

export class FakeRoleRequestRepo implements RoleRequestRepoPort {
  rows = new Map<string, RoleRequestRow>();

  constructor(private readonly users?: FakeUserRepo) {}

  async create(userId: string, requestedRole: RoleName): Promise<RoleRequestRow> {
    const pending = [...this.rows.values()].find(
      (r) => r.userId === userId && r.status === 'pending',
    );
    if (pending) {
      throw new ConflictError('You already have a pending role request.', 'ROLE_REQUEST_PENDING');
    }
    const id = nextId('rolereq');
    const u = this.users?.users.get(userId);
    const row: RoleRequestRow = {
      id,
      userId,
      userName: u?.name ?? 'User',
      userEmail: u?.email ?? 'user@example.com',
      requestedRole,
      status: 'pending',
      createdAt: new Date(),
      decidedAt: null,
    };
    this.rows.set(id, row);
    return row;
  }

  async findById(id: string): Promise<RoleRequestRow | null> {
    return this.rows.get(id) ?? null;
  }

  async findPendingForUser(userId: string): Promise<RoleRequestRow | null> {
    return (
      [...this.rows.values()].find((r) => r.userId === userId && r.status === 'pending') ?? null
    );
  }

  async listPending(): Promise<RoleRequestRow[]> {
    return [...this.rows.values()].filter((r) => r.status === 'pending');
  }

  async listForUser(userId: string): Promise<RoleRequestRow[]> {
    return [...this.rows.values()].filter((r) => r.userId === userId).reverse();
  }

  async claim(
    id: string,
    status: 'approved' | 'denied',
    _decidedById: string,
  ): Promise<RoleRequestRow | null> {
    const row = this.rows.get(id);
    if (!row || row.status !== 'pending') return null;
    row.status = status;
    row.decidedAt = new Date();
    return row;
  }
}

export class FakeContactMessageRepo implements ContactMessageRepoPort {
  rows = new Map<string, ContactMessageRow>();

  constructor(private readonly users?: FakeUserRepo) {}

  async create(
    userId: string,
    input: { subject: string; message: string },
  ): Promise<ContactMessageRow> {
    const id = nextId('contactmsg');
    const u = this.users?.users.get(userId);
    const row: ContactMessageRow = {
      id,
      userId,
      userName: u?.name ?? 'User',
      userEmail: u?.email ?? 'user@example.com',
      subject: input.subject,
      message: input.message,
      status: 'open',
      createdAt: new Date(),
      resolvedAt: null,
    };
    this.rows.set(id, row);
    return row;
  }

  async findById(id: string): Promise<ContactMessageRow | null> {
    return this.rows.get(id) ?? null;
  }

  async listAll(): Promise<ContactMessageRow[]> {
    return [...this.rows.values()].reverse();
  }

  async resolve(id: string, _resolvedById: string): Promise<ContactMessageRow> {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError('Message not found');
    row.status = 'resolved';
    row.resolvedAt = new Date();
    return row;
  }
}

export class FakeFixtureRepo implements FixtureRepoPort {
  fixtures = new Map<string, FixtureWrite & { id: string }>();
  teamNames = new Map<string, string>();
  draftAgeGroupIds = new Map<string, string>();
  ageGroupLabels = new Map<string, string>();
  groundNames = new Map<string, string>();
  tournaments = new Map<string, { name: string; status: TournamentStatus }>();
  registered = new Map<string, RegisteredTeam[]>();
  assignments?: FakeUmpireAssignmentRepo;

  private compose(f: FixtureWrite & { id: string }): FixtureRow {
    const t = this.tournaments.get(f.tournamentId);
    return {
      id: f.id,
      tournamentId: f.tournamentId,
      tournamentName: t?.name ?? 'Tournament',
      homeTeamId: f.homeTeamId,
      homeTeamName: this.teamNames.get(f.homeTeamId) ?? f.homeTeamId,
      awayTeamId: f.awayTeamId,
      awayTeamName: this.teamNames.get(f.awayTeamId) ?? f.awayTeamId,
      groundId: f.groundId ?? null,
      groundName: f.groundId ? (this.groundNames.get(f.groundId) ?? null) : null,
      groundBookingStatus: null,
      startsAt: f.startsAt,
      durationMinutes: f.durationMinutes,
      umpires: this.assignments?.forFixture(f.id) ?? [],
      ageGroupId: this.draftAgeGroupIds.get(f.homeTeamId) ?? null,
      ageGroupLabel: (() => {
        const id = this.draftAgeGroupIds.get(f.homeTeamId);
        return id ? (this.ageGroupLabels.get(id) ?? id) : null;
      })(),
    };
  }

  async create(data: FixtureWrite): Promise<FixtureRow> {
    const id = nextId('fixture');
    const stored = { ...data, id };
    this.fixtures.set(id, stored);
    return this.compose(stored);
  }

  async findById(id: string): Promise<FixtureRow | null> {
    const f = this.fixtures.get(id);
    return f ? this.compose(f) : null;
  }

  async listForTournament(tournamentId: string): Promise<FixtureRow[]> {
    return [...this.fixtures.values()]
      .filter((f) => f.tournamentId === tournamentId)
      .map((f) => this.compose(f));
  }

  async listForTeamIds(teamIds: string[]): Promise<FixtureRow[]> {
    return [...this.fixtures.values()]
      .filter((f) => teamIds.includes(f.homeTeamId) || teamIds.includes(f.awayTeamId))
      .filter((f) => this.tournaments.get(f.tournamentId)?.status !== 'draft')
      .map((f) => this.compose(f))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  async updateTime(
    id: string,
    startsAt: Date,
    durationMinutes: number,
    groundId?: string | null,
  ): Promise<FixtureRow> {
    const f = this.fixtures.get(id);
    if (!f) throw new NotFoundError('Fixture not found');
    f.startsAt = startsAt;
    f.durationMinutes = durationMinutes;
    if (groundId !== undefined) f.groundId = groundId;
    return this.compose(f);
  }

  async clearGround(id: string): Promise<void> {
    const f = this.fixtures.get(id);
    if (!f) throw new NotFoundError('Fixture not found');
    f.groundId = null;
  }

  async registeredTeams(tournamentId: string): Promise<RegisteredTeam[]> {
    return this.registered.get(tournamentId) ?? [];
  }

  async listOpenForUmpire(
    umpireId: string,
  ): Promise<(FixtureRow & { myStatus: AssignmentStatus | null })[]> {
    return (
      [...this.fixtures.values()]
        .filter((f) => this.tournaments.get(f.tournamentId)?.status === 'published')
        .reverse()
        .map((f) => ({
          ...this.compose(f),
          myStatus: this.assignments?.statusOf(f.id, umpireId) ?? null,
        }))
    );
  }
}

export class FakeUmpireAssignmentRepo implements UmpireAssignmentRepoPort {
  rows = new Map<string, { fixtureId: string; umpireId: string; status: AssignmentStatus }>();

  constructor(
    private readonly fixtureRepo?: FakeFixtureRepo,
    private readonly users?: FakeUserRepo,
  ) {}

  private key(f: string, u: string) {
    return `${f}:${u}`;
  }

  async upsertStatus(fixtureId: string, umpireId: string, status: AssignmentStatus): Promise<void> {
    this.rows.set(this.key(fixtureId, umpireId), { fixtureId, umpireId, status });
  }

  async find(fixtureId: string, umpireId: string): Promise<{ status: AssignmentStatus } | null> {
    const r = this.rows.get(this.key(fixtureId, umpireId));
    return r ? { status: r.status } : null;
  }

  async setStatus(fixtureId: string, umpireId: string, status: AssignmentStatus): Promise<void> {
    const r = this.rows.get(this.key(fixtureId, umpireId));
    if (!r) throw new NotFoundError('Assignment not found');
    r.status = status;
  }

  async acceptedSlots(umpireId: string): Promise<AcceptedSlot[]> {
    const out: AcceptedSlot[] = [];
    for (const r of this.rows.values()) {
      if (r.umpireId === umpireId && r.status === 'accepted') {
        const fx = this.fixtureRepo?.fixtures.get(r.fixtureId);
        if (fx)
          out.push({
            fixtureId: r.fixtureId,
            startsAt: fx.startsAt,
            durationMinutes: fx.durationMinutes,
          });
      }
    }
    return out;
  }

  async scheduleFor(umpireId: string): Promise<UmpireScheduleRow[]> {
    const out: UmpireScheduleRow[] = [];
    for (const r of this.rows.values()) {
      if (r.umpireId === umpireId && r.status === 'accepted') {
        const fx = this.fixtureRepo?.fixtures.get(r.fixtureId);
        if (!fx) continue;
        out.push({
          fixtureId: r.fixtureId,
          tournamentName: this.fixtureRepo?.tournaments.get(fx.tournamentId)?.name ?? 'Tournament',
          homeTeamName: this.fixtureRepo?.teamNames.get(fx.homeTeamId) ?? fx.homeTeamId,
          awayTeamName: this.fixtureRepo?.teamNames.get(fx.awayTeamId) ?? fx.awayTeamId,
          groundName: fx.groundId ? (this.fixtureRepo?.groundNames.get(fx.groundId) ?? null) : null,
          startsAt: fx.startsAt,
          durationMinutes: fx.durationMinutes,
        });
      }
    }
    return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  forFixture(
    fixtureId: string,
  ): { umpireId: string; umpireName: string; status: AssignmentStatus }[] {
    return [...this.rows.values()]
      .filter((r) => r.fixtureId === fixtureId)
      .map((r) => ({
        umpireId: r.umpireId,
        umpireName: this.users?.users.get(r.umpireId)?.name ?? 'Umpire',
        status: r.status,
      }));
  }

  statusOf(fixtureId: string, umpireId: string): AssignmentStatus | null {
    return this.rows.get(this.key(fixtureId, umpireId))?.status ?? null;
  }
}

export class FakeResultRepo implements ResultRepoPort {
  contexts = new Map<string, FixtureResultContext>();
  results = new Map<string, ResultData & { enteredById: string }>();
  registered = new Map<string, string[]>();
  standings = new Map<string, StandingRow[]>();

  constructor(private readonly users?: FakeUserRepo) {}

  async fixtureContext(fixtureId: string): Promise<FixtureResultContext | null> {
    return this.contexts.get(fixtureId) ?? null;
  }

  async findByFixture(fixtureId: string): Promise<ResultData | null> {
    return this.results.get(fixtureId) ?? null;
  }

  async findByFixtureIds(fixtureIds: string[]): Promise<ResultData[]> {
    return fixtureIds.flatMap((id) => {
      const r = this.results.get(id);
      return r ? [r] : [];
    });
  }

  async upsert(data: {
    fixtureId: string;
    homeScore: string;
    awayScore: string;
    winnerTeamId: string | null;
    enteredById: string;
    homeRunsTotal: number | null;
    awayRunsTotal: number | null;
  }): Promise<{ id: string }> {
    const enteredByName = this.users?.users.get(data.enteredById)?.name ?? 'Unknown';
    const existing = this.results.get(data.fixtureId);
    this.results.set(data.fixtureId, {
      ...data,
      enteredByName,
      enteredAt: new Date(),
      playerScores: existing?.playerScores ?? [],
    });
    return { id: data.fixtureId };
  }

  async replacePlayerScores(
    resultId: string,
    homeTeamId: string,
    awayTeamId: string,
    homeScores: { userId: string; runs: number; wickets: number }[],
    awayScores: { userId: string; runs: number; wickets: number }[],
  ): Promise<void> {
    const existing = this.results.get(resultId);
    if (!existing) return;
    const nameOf = (userId: string) => this.users?.users.get(userId)?.name ?? 'Player';
    const rows: PlayerInningsScoreRow[] = [
      ...homeScores.map((s) => ({
        userId: s.userId,
        playerName: nameOf(s.userId),
        teamId: homeTeamId,
        runs: s.runs,
        wickets: s.wickets,
      })),
      ...awayScores.map((s) => ({
        userId: s.userId,
        playerName: nameOf(s.userId),
        teamId: awayTeamId,
        runs: s.runs,
        wickets: s.wickets,
      })),
    ];
    existing.playerScores = rows;
  }

  async outcomesForTournament(tournamentId: string): Promise<ResultOutcome[]> {
    const out: ResultOutcome[] = [];
    for (const [fixtureId, r] of this.results) {
      const ctx = this.contexts.get(fixtureId);
      if (ctx?.tournamentId === tournamentId) {
        out.push({
          homeTeamId: ctx.homeTeamId,
          awayTeamId: ctx.awayTeamId,
          winnerTeamId: r.winnerTeamId,
        });
      }
    }
    return out;
  }

  async registeredTeamIds(tournamentId: string): Promise<string[]> {
    return this.registered.get(tournamentId) ?? [];
  }

  async replaceStandings(tournamentId: string, rows: StandingRow[]): Promise<void> {
    this.standings.set(tournamentId, rows);
  }
}

export class FakePlayerProfileRepo implements PlayerProfileRepoPort {
  usersById = new Map<string, Partial<PublicPlayerRow> & { id: string; name: string }>();
  memberships = new Map<string, PlayerTeamTournament[]>();
  outcomes = new Map<string, TeamOutcome[]>();
  runs = new Map<string, number>();

  async findUser(userId: string): Promise<PublicPlayerRow | null> {
    const u = this.usersById.get(userId);
    if (!u) return null;
    return {
      photoKey: null,
      school: null,
      jerseyNumber: null,
      jerseyName: null,
      jerseySize: null,
      battingStyle: null,
      battingStyleOther: null,
      bowlingStyle: null,
      bowlingStyleOther: null,
      playingRole: null,
      heightValue: null,
      heightUnit: null,
      weightValue: null,
      weightUnit: null,
      gender: null,
      consentAcceptedAt: null,
      ...u,
    };
  }

  async teamTournaments(userId: string): Promise<PlayerTeamTournament[]> {
    return this.memberships.get(userId) ?? [];
  }

  async teamOutcomes(tournamentId: string, teamId: string): Promise<TeamOutcome[]> {
    return this.outcomes.get(`${tournamentId}:${teamId}`) ?? [];
  }

  async runsScored(tournamentId: string, userId: string): Promise<number> {
    return this.runs.get(`${tournamentId}:${userId}`) ?? 0;
  }
}

export class FakeGroundRepo implements GroundRepoPort {
  rows = new Map<string, GroundRow>();
  bookings?: { rows: Map<string, { groundId: string }> };
  fixtures?: { fixtures: Map<string, { groundId: string | null }> };

  async create(ownerId: string, data: GroundWrite): Promise<GroundRow> {
    const id = nextId('ground');
    const row: GroundRow = { id, ownerId, ...data };
    this.rows.set(id, row);
    return row;
  }

  async findById(id: string): Promise<GroundRow | null> {
    return this.rows.get(id) ?? null;
  }

  async listByOwner(ownerId: string): Promise<GroundRow[]> {
    return [...this.rows.values()].filter((g) => g.ownerId === ownerId);
  }

  async update(id: string, data: Partial<GroundWrite>): Promise<GroundRow> {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError('Ground not found');
    const updated = { ...row, ...data };
    this.rows.set(id, updated);
    return updated;
  }

  async searchByName(query: string): Promise<GroundSearchResult[]> {
    return [...this.rows.values()]
      .filter((g) => g.name.toLowerCase().includes(query.toLowerCase()))
      .map((g) => ({
        id: g.id,
        name: g.name,
        location: g.location,
        capacity: g.capacity,
        facilities: g.facilities,
        availabilityRules: g.availabilityRules,
      }));
  }

  async delete(id: string): Promise<void> {
    if (!this.rows.has(id)) throw new NotFoundError('Ground not found');
    const hasBooking = [...(this.bookings?.rows.values() ?? [])].some((b) => b.groundId === id);
    const hasFixture = [...(this.fixtures?.fixtures.values() ?? [])].some((f) => f.groundId === id);
    if (hasBooking || hasFixture) {
      throw new ConflictError(
        'This ground still has bookings or scheduled fixtures — cancel or reassign them first.',
        'GROUND_IN_USE',
      );
    }
    this.rows.delete(id);
  }
}

export class FakeBookingRepo implements BookingRepoPort {
  rows = new Map<string, BookingRow>();

  constructor(
    private readonly grounds?: FakeGroundRepo,
    private readonly users?: FakeUserRepo,
  ) {}

  async create(data: BookingWrite): Promise<BookingRow> {
    const id = nextId('booking');
    const ground = this.grounds?.rows.get(data.groundId);
    const requester = this.users?.users.get(data.requesterId);
    const row: BookingRow = {
      id,
      groundId: data.groundId,
      groundName: ground?.name ?? 'Ground',
      requesterId: data.requesterId,
      requesterName: requester?.name ?? 'Requester',
      fixtureId: data.fixtureId ?? null,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      status: 'requested',
    };
    this.rows.set(id, row);
    return row;
  }

  async findById(id: string): Promise<BookingRow | null> {
    return this.rows.get(id) ?? null;
  }

  async listForGround(groundId: string): Promise<BookingRow[]> {
    return [...this.rows.values()].filter((b) => b.groundId === groundId);
  }

  async listForOwner(ownerId: string): Promise<BookingRow[]> {
    const groundIds = new Set(
      [...(this.grounds?.rows.values() ?? [])]
        .filter((g) => g.ownerId === ownerId)
        .map((g) => g.id),
    );
    return [...this.rows.values()].filter((b) => groundIds.has(b.groundId));
  }

  async listForRequester(requesterId: string): Promise<BookingRow[]> {
    return [...this.rows.values()].filter((b) => b.requesterId === requesterId);
  }

  async setStatus(id: string, status: BookingStatus): Promise<BookingRow> {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError('Booking not found');
    if (status === 'confirmed') {
      const overlap = [...this.rows.values()].some(
        (b) =>
          b.id !== id &&
          b.groundId === row.groundId &&
          b.status === 'confirmed' &&
          b.startsAt < row.endsAt &&
          row.startsAt < b.endsAt,
      );
      if (overlap) {
        throw new ConflictError(
          'This time slot overlaps an already-confirmed booking on this ground.',
          'BOOKING_CONFLICT',
        );
      }
    }
    row.status = status;
    return row;
  }
}

export class FakeTournamentRepo implements TournamentRepoPort {
  summaries: TournamentSummaryRow[] = [];
  details = new Map<string, TournamentDetailRow>();

  async listSummaries(statuses: TournamentStatus[]): Promise<TournamentSummaryRow[]> {
    return this.summaries.filter((s) => statuses.includes(s.status));
  }

  async findDetail(id: string): Promise<TournamentDetailRow | null> {
    return this.details.get(id) ?? null;
  }
}

export const fakeTx: TxRunner = { run: (fn) => fn(undefined as never) };

export function makeFakeParentService(users: FakeUserRepo, audit: FakeAudit): ParentService {
  return new ParentService({
    users,
    usersService: {
      uploadPhoto: async () => {
        throw new Error('uploadPhoto not stubbed for this test');
      },
      deletePhoto: async () => {
        throw new Error('deletePhoto not stubbed for this test');
      },
      getProfile: async () => {
        throw new Error('getProfile not stubbed for this test');
      },
      applySportsProfile: async () => {
        throw new Error('applySportsProfile not stubbed for this test');
      },
    },
    authz: new AuthzService(users),
    audit,
    tx: fakeTx,
    teams: {
      listAcceptedTeamIdsForUser: async () => {
        throw new Error('listAcceptedTeamIdsForUser not stubbed for this test');
      },
    },
    fixtures: {
      listForTeamIds: async () => {
        throw new Error('listForTeamIds not stubbed for this test');
      },
    },
    results: {
      findByFixtureIds: async () => {
        throw new Error('findByFixtureIds not stubbed for this test');
      },
    },
  });
}

export function tokenFromUrl(url: string): string {
  const token = new URL(url).searchParams.get('token');
  if (!token) throw new Error(`no token in url: ${url}`);
  return token;
}

export class FakeRateLimitStore implements RateLimitStore {
  localKeys = false;
  windowMs = 0;
  counts = new Map<string, { count: number; resetAt: number }>();

  constructor(readonly prefix: string) {}

  init(options: { windowMs: number }): void {
    this.windowMs = options.windowMs;
  }

  private fullKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  increment(key: string): IncrementResponse {
    const fullKey = this.fullKey(key);
    const now = Date.now();
    const existing = this.counts.get(fullKey);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.counts.set(fullKey, { count: 1, resetAt });
      return { totalHits: 1, resetTime: new Date(resetAt) };
    }
    existing.count += 1;
    return { totalHits: existing.count, resetTime: new Date(existing.resetAt) };
  }

  decrement(key: string): void {
    const existing = this.counts.get(this.fullKey(key));
    if (existing) existing.count = Math.max(0, existing.count - 1);
  }

  resetKey(key: string): void {
    this.counts.delete(this.fullKey(key));
  }
}
