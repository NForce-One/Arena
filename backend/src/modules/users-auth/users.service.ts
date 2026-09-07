import {
  ADULT_AGE_YEARS,
  MAX_PHOTO_BYTES,
  ROLE_LABELS,
  isAdultDate,
  type AdminUserDto,
  type AuthUserDto,
  type BattingStyle,
  type BowlingStyle,
  type Gender,
  type HeightUnit,
  type JerseySize,
  type PlayingRole,
  type ProfileDto,
  type RoleName,
  type SportsProfileInput,
  type UpdateProfileInput,
  type UploadPhotoInput,
  type WeightUnit,
} from '@nforce/shared';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PHOTO_URL_TTL_SECONDS, type StorageAdapter } from '../../adapters/storage/StorageAdapter';
import type { TxRunner } from '../../lib/db';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../../lib/errors';
import type { AuditPort } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';
import type { AuthzService } from './authz.service';
import { syncClubId } from './clubId';
import { ROLE_IDS } from './roles';
import type { UserRepoPort } from './user.repo';

export interface UsersServiceDeps {
  users: UserRepoPort;
  authz: AuthzService;
  audit: AuditPort;
  tx: TxRunner;
  auth: { sendVerificationEmailForAdmin(userId: string): Promise<void> };
  storage: StorageAdapter;
  notifications: NotificationService;
}

export class UsersService {
  constructor(private readonly deps: UsersServiceDeps) {}

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      verified: user.verified,
      roles: await this.deps.users.getRoleNames(user.id),
    };
  }

  async listAdminIds(): Promise<string[]> {
    return this.deps.users.listIds('platform_admin');
  }

  private async toProfileDto(user: {
    id: string;
    name: string;
    email: string;
    dateOfBirth: Date | null;
    photoKey: string | null;
    clubId: string | null;
    academyName: string | null;
    state: string | null;
    notifyPublishStates: string[];
    phone: string | null;
    school: string | null;
    jerseyNumber: number | null;
    jerseyName: string | null;
    jerseySize: JerseySize | null;
    battingStyle: BattingStyle | null;
    battingStyleOther: string | null;
    bowlingStyle: BowlingStyle | null;
    bowlingStyleOther: string | null;
    playingRole: PlayingRole | null;
    heightValue: number | null;
    heightUnit: HeightUnit | null;
    weightValue: number | null;
    weightUnit: WeightUnit | null;
    gender: Gender | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    consentAcceptedAt: Date | null;
  }): Promise<ProfileDto> {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
      photoUrl: user.photoKey
        ? await this.deps.storage.signedUrl(user.photoKey, PHOTO_URL_TTL_SECONDS)
        : null,
      clubId: user.clubId,
      academyName: user.academyName,
      state: user.state,
      notifyPublishStates: user.notifyPublishStates,
      phone: user.phone,
      school: user.school,
      jerseyNumber: user.jerseyNumber,
      jerseyName: user.jerseyName,
      jerseySize: user.jerseySize,
      battingStyle: user.battingStyle,
      battingStyleOther: user.battingStyleOther,
      bowlingStyle: user.bowlingStyle,
      bowlingStyleOther: user.bowlingStyleOther,
      playingRole: user.playingRole,
      heightValue: user.heightValue,
      heightUnit: user.heightUnit,
      weightValue: user.weightValue,
      weightUnit: user.weightUnit,
      gender: user.gender,
      emergencyContactName: user.emergencyContactName,
      emergencyContactPhone: user.emergencyContactPhone,
      consentConfirmed: user.consentAcceptedAt != null,
      consentDate: user.consentAcceptedAt
        ? user.consentAcceptedAt.toISOString().slice(0, 10)
        : null,
    };
  }

  async getProfile(userId: string): Promise<ProfileDto> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    return this.toProfileDto(user);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<ProfileDto> {
    const dob = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
    if (input.dateOfBirth) {
      const existing = await this.deps.users.findById(userId);
      if (!existing) throw new NotFoundError('User not found');
      if (!existing.managedByParentId && !isAdultDate(input.dateOfBirth)) {
        throw new ConflictError(
          `You must be at least ${ADULT_AGE_YEARS} to hold your own account.`,
          'UNDER_ADULT_AGE',
        );
      }
    }
    const user = await this.deps.users.updateProfile(userId, {
      name: input.name,
      dateOfBirth: dob,
      academyName: input.academyName?.trim() || null,
      state: input.state?.trim() || null,
    });
    return this.toProfileDto(user);
  }

  async updateNotifyPublishStates(userId: string, states: string[]): Promise<ProfileDto> {
    const user = await this.deps.users.updateNotifyPublishStates(userId, states);
    return this.toProfileDto(user);
  }

  async uploadPhoto(userId: string, input: UploadPhotoInput): Promise<ProfileDto> {
    const existing = await this.deps.users.findById(userId);
    if (!existing) throw new NotFoundError('User not found');

    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.data, 'base64');
    } catch {
      throw new ValidationError(undefined, 'Photo data is not valid base64');
    }
    if (bytes.length === 0) throw new ValidationError(undefined, 'Photo data is empty');
    if (bytes.length > MAX_PHOTO_BYTES) {
      throw new ValidationError(
        undefined,
        `Photo must be ${Math.floor(MAX_PHOTO_BYTES / (1024 * 1024))} MB or smaller`,
      );
    }

    const ext =
      input.contentType === 'image/png'
        ? 'png'
        : input.contentType === 'image/webp'
          ? 'webp'
          : 'jpg';
    const key = `user-${userId}-${randomUUID()}.${ext}`;
    await this.deps.storage.put(key, bytes, input.contentType);

    const user = await this.deps.users.setPhotoKey(userId, key);
    if (existing.photoKey && existing.photoKey !== key) {
      await this.deps.storage.delete(existing.photoKey);
    }
    return this.toProfileDto(user);
  }

  async deletePhoto(userId: string): Promise<ProfileDto> {
    const existing = await this.deps.users.findById(userId);
    if (!existing) throw new NotFoundError('User not found');
    const user = await this.deps.users.setPhotoKey(userId, null);
    if (existing.photoKey) await this.deps.storage.delete(existing.photoKey);
    return this.toProfileDto(user);
  }

  async updateSportsProfile(userId: string, input: SportsProfileInput): Promise<ProfileDto> {
    return this.applySportsProfile(userId, userId, input);
  }

  async applySportsProfile(
    subjectUserId: string,
    consentedByUserId: string,
    input: SportsProfileInput,
    onUpdated?: (subject: { id: string }, db: Prisma.TransactionClient) => Promise<void>,
  ): Promise<ProfileDto> {
    try {
      const updated = await this.deps.tx.run(
        async (db) => {
          if (input.jerseyNumber != null) {
            const collision = await this.deps.users.findTeammateWithJerseyNumber(
              subjectUserId,
              input.jerseyNumber,
              db,
            );
            if (collision) {
              throw new ConflictError(
                `Jersey number ${input.jerseyNumber} is already taken by a teammate on "${collision.teamName}".`,
                'JERSEY_NUMBER_TAKEN',
              );
            }
          }
          const user = await this.deps.users.updateSportsProfile(
            subjectUserId,
            {
              phone: input.phone || null,
              school: input.school || null,
              jerseyNumber: input.jerseyNumber ?? null,
              jerseyName: input.jerseyName || null,
              jerseySize: input.jerseySize ?? null,
              battingStyle: input.battingStyle ?? null,
              battingStyleOther: input.battingStyleOther ?? null,
              bowlingStyle: input.bowlingStyle ?? null,
              bowlingStyleOther: input.bowlingStyleOther ?? null,
              playingRole: input.playingRole ?? null,
              heightValue: input.heightValue ?? null,
              heightUnit: input.heightUnit ?? null,
              weightValue: input.weightValue ?? null,
              weightUnit: input.weightUnit ?? null,
              gender: input.gender ?? null,
              emergencyContactName: input.emergencyContactName || null,
              emergencyContactPhone: input.emergencyContactPhone || null,
              consentedByUserId,
              consentAcceptedAt: new Date(),
            },
            db,
          );
          if (onUpdated) await onUpdated(user, db);
          return user;
        },
        { isolationLevel: 'Serializable' },
      );
      return this.toProfileDto(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new ConflictError(
          'A conflicting change happened at the same moment. Please try again.',
          'SPORTS_PROFILE_CONFLICT',
        );
      }
      throw err;
    }
  }

  async becomeParent(userId: string, ip?: string): Promise<RoleName[]> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    await this.deps.tx.run(async (db) => {
      await this.deps.users.addRole(userId, ROLE_IDS.parent, db);
      await this.deps.audit.write(
        {
          action: 'role.self_granted',
          actorUserId: userId,
          entityType: 'user',
          entityId: userId,
          meta: { role: 'parent' },
          ip,
        },
        db,
      );
      await syncClubId(this.deps.users, userId, db);
    });
    return this.deps.users.getRoleNames(userId);
  }

  async becomePlayer(userId: string, ip?: string): Promise<RoleName[]> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    await this.deps.tx.run(async (db) => {
      await this.deps.users.addRole(userId, ROLE_IDS.player, db);
      await this.deps.audit.write(
        {
          action: 'role.self_granted',
          actorUserId: userId,
          entityType: 'user',
          entityId: userId,
          meta: { role: 'player' },
          ip,
        },
        db,
      );
      await syncClubId(this.deps.users, userId, db);
    });
    return this.deps.users.getRoleNames(userId);
  }

  async listUsers(actorId: string): Promise<AdminUserDto[]> {
    await this.deps.authz.assertRole(actorId, 'platform_admin');
    const rows = await this.deps.users.listWithRoles();
    return rows.map(({ user, roles }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      verified: user.verified,
      roles,
      createdAt: user.createdAt.toISOString(),
      clubId: user.clubId,
    }));
  }

  async grantRole(actorId: string, targetUserId: string, role: RoleName, ip?: string) {
    await this.deps.authz.assertRole(actorId, 'platform_admin');
    if (role === 'platform_admin') {
      throw new ConflictError(
        'Platform admin cannot be granted from this screen.',
        'PLATFORM_ADMIN_NOT_GRANTABLE',
      );
    }
    const target = await this.deps.users.findById(targetUserId);
    if (!target) throw new NotFoundError('User not found');

    await this.deps.tx.run(async (db) => {
      await this.deps.users.addRole(targetUserId, ROLE_IDS[role], db);
      await this.deps.audit.write(
        {
          action: 'role.granted',
          actorUserId: actorId,
          entityType: 'user',
          entityId: targetUserId,
          meta: { role },
          ip,
        },
        db,
      );
      await syncClubId(this.deps.users, targetUserId, db);
    });
    await this.deps.notifications.notify({
      userId: targetUserId,
      type: 'role_granted',
      title: `You're now a ${ROLE_LABELS[role]}`,
      body: `An admin gave your account the ${ROLE_LABELS[role]} role.`,
      payload: { role },
    });
    return this.deps.users.getRoleNames(targetUserId);
  }

  async grantRoleReplacingPlayer(
    actorId: string,
    targetUserId: string,
    role: RoleName,
    ip?: string,
  ) {
    await this.deps.authz.assertRole(actorId, 'platform_admin');
    const target = await this.deps.users.findById(targetUserId);
    if (!target) throw new NotFoundError('User not found');

    await this.deps.tx.run(async (db) => {
      await this.deps.users.addRole(targetUserId, ROLE_IDS[role], db);
      await this.deps.users.removeRole(targetUserId, ROLE_IDS.player, db);
      await this.deps.audit.write(
        {
          action: 'role.granted',
          actorUserId: actorId,
          entityType: 'user',
          entityId: targetUserId,
          meta: { role },
          ip,
        },
        db,
      );
      await this.deps.audit.write(
        {
          action: 'role.revoked',
          actorUserId: actorId,
          entityType: 'user',
          entityId: targetUserId,
          meta: { role: 'player', reason: 'role_request_approved' },
          ip,
        },
        db,
      );
      await syncClubId(this.deps.users, targetUserId, db);
    });
    return this.deps.users.getRoleNames(targetUserId);
  }

  async revokeRole(actorId: string, targetUserId: string, role: RoleName, ip?: string) {
    await this.deps.authz.assertRole(actorId, 'platform_admin');
    const target = await this.deps.users.findById(targetUserId);
    if (!target) throw new NotFoundError('User not found');

    if (role === 'platform_admin' && targetUserId === actorId) {
      throw new ConflictError(
        'You cannot remove your own platform admin role.',
        'CANNOT_REVOKE_OWN_ADMIN',
      );
    }

    await this.deps.tx.run(async (db) => {
      await this.deps.users.removeRole(targetUserId, ROLE_IDS[role], db);
      await this.deps.audit.write(
        {
          action: 'role.revoked',
          actorUserId: actorId,
          entityType: 'user',
          entityId: targetUserId,
          meta: { role },
          ip,
        },
        db,
      );
      await syncClubId(this.deps.users, targetUserId, db);
    });
    await this.deps.notifications.notify({
      userId: targetUserId,
      type: 'role_revoked',
      title: `${ROLE_LABELS[role]} role removed`,
      body: `An admin removed the ${ROLE_LABELS[role]} role from your account.`,
      payload: { role },
    });
    return this.deps.users.getRoleNames(targetUserId);
  }

  async requestVerification(actorId: string, targetUserId: string, ip?: string): Promise<void> {
    await this.deps.authz.assertRole(actorId, 'platform_admin');
    await this.deps.auth.sendVerificationEmailForAdmin(targetUserId);
    await this.deps.audit.write({
      action: 'user.verification_requested',
      actorUserId: actorId,
      entityType: 'user',
      entityId: targetUserId,
      ip,
    });
  }
}
