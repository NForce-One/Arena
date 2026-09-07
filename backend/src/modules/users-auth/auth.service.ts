import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import {
  ROLE_LABELS,
  type AuthUserDto,
  type ClaimAccountInput,
  type InviteChildToClaimInput,
  type LoginInput,
  type ResetPasswordInput,
  type RoleName,
  type SignupInput,
} from '@nforce/shared';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { EmailAdapter } from '../../adapters/email/EmailAdapter';
import type { TxRunner } from '../../lib/db';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
} from '../../lib/errors';
import { logger } from '../../lib/logger';
import { tokenErrorFrom } from '../../lib/tokenErrors';
import type { AuditPort } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';
import type { ExternalInviteRepoPort } from '../registrations/externalInvite.repo';
import type { TournamentInvitationService } from '../registrations/tournamentInvitation.service';
import type { AuthzService } from './authz.service';
import { syncClubId } from './clubId';
import type { OneTimeTokenRepoPort } from './oneTimeToken.repo';
import type { RefreshTokenRepoPort } from './refreshToken.repo';
import { ROLE_IDS } from './roles';
import type { RoleRequestRepoPort } from './roleRequest.repo';
import type { TokenServicePort } from './token.service';
import type { UserRepoPort } from './user.repo';

const PLAYER_ROLE_ID = 3;
const PARENT_ROLE_ID = 7;
const CLAIM_TTL_DAYS = 7;

const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$FfMap/tsgl10iDH41HDsJw$BDcR8ClBybd9PTXkNU0Ef1Q54MXuqR2w9yBpPeI5XYs';

export interface AuthConfig {
  webOrigin: string;
  accessTtlMin: number;
  refreshTtlDays: number;
  verifyTtlHours: number;
  resetTtlMin: number;
}

export interface AuthContext {
  ip?: string;
  userAgent?: string;
}

export interface LoginAttemptTrackerPort {
  recordFailure(key: string): Promise<{ count: number; resetTime: Date }>;
  clear(key: string): Promise<void>;
}

export interface AuthServiceDeps {
  users: UserRepoPort;
  refreshTokens: RefreshTokenRepoPort;
  oneTimeTokens: OneTimeTokenRepoPort;
  tokens: TokenServicePort;
  audit: AuditPort;
  email: EmailAdapter;
  tx: TxRunner;
  roleRequests: Pick<RoleRequestRepoPort, 'create'>;
  notifications: NotificationService;
  authz: AuthzService;
  loginAttempts?: { tracker: LoginAttemptTrackerPort; limit: number };
  externalInvites: Pick<ExternalInviteRepoPort, 'claim' | 'recordClaimedBy'>;
  tournamentInvitations: Pick<TournamentInvitationService, 'invitePlayer'>;
  config: AuthConfig;
}

export interface LoginResult {
  user: AuthUserDto;
  accessToken: string;
  refreshToken: { raw: string; expiresAt: Date };
}

function toAuthUserDto(user: User, roles: RoleName[]): AuthUserDto {
  return { id: user.id, name: user.name, email: user.email, verified: user.verified, roles };
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async signup(input: SignupInput, ctx: AuthContext): Promise<AuthUserDto> {
    const passwordHash = await argon2Hash(input.password);
    const user = await this.deps.tx.run(async (db) => {
      let invite:
        | Extract<
            Awaited<ReturnType<AuthServiceDeps['externalInvites']['claim']>>,
            { outcome: 'claimed' }
          >['invite']
        | undefined;
      if (input.inviteToken) {
        const result = await this.deps.externalInvites.claim(
          this.deps.tokens.hashToken(input.inviteToken),
          db,
        );
        if (result.outcome !== 'claimed') throw tokenErrorFrom(result);
        if (result.invite.email !== input.email) {
          throw new ConflictError(
            'This invite was sent to a different email address.',
            'INVITE_EMAIL_MISMATCH',
          );
        }
        invite = result.invite;
      }

      const created = await this.deps.users.create(
        {
          name: input.name,
          email: input.email,
          passwordHash,
          roleIds: invite
            ? [ROLE_IDS[invite.role]]
            : input.parentOnly
              ? [PARENT_ROLE_ID]
              : [PLAYER_ROLE_ID],
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
        },
        db,
      );
      if (input.requestedRole) {
        await this.deps.roleRequests.create(created.id, input.requestedRole, db);
      }
      if (invite) {
        await this.deps.externalInvites.recordClaimedBy(invite.id, created.id, db);
      }
      await syncClubId(this.deps.users, created.id, db);
      return { created, invite };
    });

    await this.sendVerificationEmail(user.created);
    await this.deps.audit.write({
      action: 'auth.signup',
      actorUserId: user.created.id,
      entityType: 'user',
      entityId: user.created.id,
      ip: ctx.ip,
    });

    if (input.requestedRole) {
      const role = input.requestedRole;
      const adminIds = await this.deps.users.listIds('platform_admin');
      for (const adminId of adminIds) {
        await this.deps.notifications.notify({
          userId: adminId,
          type: 'role_request_submitted',
          title: `New role request: ${ROLE_LABELS[role]}`,
          body: `${user.created.name} asked to become a ${ROLE_LABELS[role]}.`,
          payload: { userId: user.created.id, role },
        });
      }
    }

    if (user.invite?.role === 'player' && user.invite.tournamentId != null) {
      try {
        const playerInvite = user.invite;
        await this.deps.tournamentInvitations.invitePlayer(
          playerInvite.invitedByOrganizerId,
          playerInvite.tournamentId!,
          user.created.id,
          playerInvite.tournamentAgeGroupId!,
          true,
        );
      } catch (err) {
        logger.error({ err, userId: user.created.id }, 'Post-signup invitePlayer follow-up failed');
      }
    } else if (user.invite?.role === 'team_manager') {
      await this.deps.notifications.notify({
        userId: user.invite.invitedByOrganizerId,
        type: 'external_invite_joined',
        title: `${user.created.name} joined as a team manager`,
        body: `Your invite was accepted — ${user.created.name} is now a team manager.`,
        payload: { userId: user.created.id, tournamentId: user.invite.tournamentId },
      });
      if (user.invite.tournamentId != null) {
        const organizer = await this.deps.users.findById(user.invite.invitedByOrganizerId);
        await this.deps.notifications.notify({
          userId: user.created.id,
          type: 'team_manager_invite_pending',
          title: "You've been invited to manage a team",
          body: `${organizer?.name ?? 'The organizer'} invited you to manage a team for ${
            user.invite.tournamentName ?? 'their tournament'
          }. Create a team to see your invitation.`,
          payload: { tournamentId: user.invite.tournamentId },
        });
      }
    }

    return toAuthUserDto(
      user.created,
      user.invite ? [user.invite.role] : input.parentOnly ? ['parent'] : ['player'],
    );
  }

  async verifyEmail(rawToken: string): Promise<void> {
    await this.deps.tx.run(async (db) => {
      const result = await this.deps.oneTimeTokens.consume(
        this.deps.tokens.hashToken(rawToken),
        'email_verification',
        db,
      );
      if (result.outcome !== 'consumed') throw tokenErrorFrom(result);
      await this.deps.users.setVerified(result.userId, db);
    });
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.deps.users.findByEmail(email);
    if (user && !user.verified && !user.managedByParentId) {
      await this.sendVerificationEmail(user);
    }
  }

  async sendVerificationEmailForAdmin(userId: string): Promise<void> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.verified) {
      throw new ConflictError('This account is already verified.', 'ALREADY_VERIFIED');
    }
    await this.sendVerificationEmail(user);
  }

  private async sendVerificationEmail(user: User): Promise<void> {
    const token = this.deps.tokens.generateOpaqueToken();
    await this.deps.oneTimeTokens.issue({
      userId: user.id,
      type: 'email_verification',
      tokenHash: token.hash,
      expiresAt: new Date(Date.now() + this.deps.config.verifyTtlHours * 3_600_000),
    });
    try {
      await this.deps.email.sendVerificationEmail({
        to: user.email,
        name: user.name,
        verifyUrl: `${this.deps.config.webOrigin}/verify-email?token=${token.raw}`,
      });
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Verification email failed to send');
    }
  }

  async login(input: LoginInput, ctx: AuthContext): Promise<LoginResult> {
    const attemptKey = `${ctx.ip ?? 'unknown'}:${input.email}`;
    const user = await this.deps.users.findByEmail(input.email);
    if (!user || user.managedByParentId) {
      await argon2Verify(DUMMY_HASH, input.password);
      await this.recordLoginFailure(attemptKey);
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    const passwordOk = await argon2Verify(user.passwordHash, input.password);
    if (!passwordOk) {
      await this.recordLoginFailure(attemptKey);
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    await this.deps.loginAttempts?.tracker.clear(attemptKey);
    if (!user.verified) {
      throw new ForbiddenError(
        'Verify your email before logging in. Check your inbox for the confirmation link.',
        'EMAIL_NOT_VERIFIED',
      );
    }

    const token = this.deps.tokens.generateOpaqueToken();
    const expiresAt = this.refreshExpiry();
    await this.deps.refreshTokens.create({
      userId: user.id,
      familyId: randomUUID(),
      tokenHash: token.hash,
      expiresAt,
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
    });

    return {
      user: toAuthUserDto(user, await this.deps.users.getRoleNames(user.id)),
      accessToken: await this.deps.tokens.signAccessToken(user.id, this.deps.config.accessTtlMin),
      refreshToken: { raw: token.raw, expiresAt },
    };
  }

  async refresh(rawToken: string | undefined, ctx: AuthContext): Promise<LoginResult> {
    if (!rawToken) throw new UnauthorizedError('Not signed in', 'INVALID_REFRESH');

    const row = await this.deps.refreshTokens.findByHash(this.deps.tokens.hashToken(rawToken));
    if (!row || row.revokedAt || row.expiresAt <= new Date()) {
      throw new UnauthorizedError('Session expired, please log in again', 'INVALID_REFRESH');
    }

    if (row.rotatedAt) {
      await this.revokeEverything(row.userId, row.familyId, ctx);
      throw new UnauthorizedError('Session expired, please log in again', 'INVALID_REFRESH');
    }

    const next = this.deps.tokens.generateOpaqueToken();
    const expiresAt = this.refreshExpiry();
    const successor = await this.deps.refreshTokens.rotate(row.id, {
      userId: row.userId,
      familyId: row.familyId,
      tokenHash: next.hash,
      expiresAt,
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
    });
    if (!successor) {
      await this.revokeEverything(row.userId, row.familyId, ctx);
      throw new UnauthorizedError('Session expired, please log in again', 'INVALID_REFRESH');
    }

    const user = await this.deps.users.findById(row.userId);
    if (!user)
      throw new UnauthorizedError('Session expired, please log in again', 'INVALID_REFRESH');

    return {
      user: toAuthUserDto(user, await this.deps.users.getRoleNames(user.id)),
      accessToken: await this.deps.tokens.signAccessToken(user.id, this.deps.config.accessTtlMin),
      refreshToken: { raw: next.raw, expiresAt },
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const row = await this.deps.refreshTokens.findByHash(this.deps.tokens.hashToken(rawToken));
    if (row) await this.deps.refreshTokens.revokeFamily(row.familyId);
  }

  private async revokeEverything(userId: string, familyId: string, ctx: AuthContext) {
    await this.deps.tx.run(async (db) => {
      await this.deps.refreshTokens.revokeAllForUser(userId, db);
      await this.deps.audit.write(
        {
          action: 'auth.refresh_reuse_detected',
          actorUserId: userId,
          entityType: 'user',
          entityId: userId,
          meta: { familyId, response: 'revoked_all_sessions' },
          ip: ctx.ip,
        },
        db,
      );
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.deps.users.findByEmail(email);
    if (!user || user.managedByParentId) return;

    const token = this.deps.tokens.generateOpaqueToken();
    await this.deps.oneTimeTokens.issue({
      userId: user.id,
      type: 'password_reset',
      tokenHash: token.hash,
      expiresAt: new Date(Date.now() + this.deps.config.resetTtlMin * 60_000),
    });
    try {
      await this.deps.email.sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl: `${this.deps.config.webOrigin}/reset-password?token=${token.raw}`,
      });
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Password reset email failed to send');
    }
  }

  async resetPassword(input: ResetPasswordInput, ctx: AuthContext): Promise<void> {
    const passwordHash = await argon2Hash(input.password);
    await this.deps.tx.run(async (db) => {
      const result = await this.deps.oneTimeTokens.consume(
        this.deps.tokens.hashToken(input.token),
        'password_reset',
        db,
      );
      if (result.outcome !== 'consumed') throw tokenErrorFrom(result);

      await this.deps.users.updatePassword(result.userId, passwordHash, db);
      await this.deps.refreshTokens.revokeAllForUser(result.userId, db);
      await this.deps.audit.write(
        {
          action: 'auth.password_reset',
          actorUserId: result.userId,
          entityType: 'user',
          entityId: result.userId,
          meta: { response: 'revoked_all_sessions' },
          ip: ctx.ip,
        },
        db,
      );
    });
  }

  async inviteChildToClaim(
    adminId: string,
    childId: string,
    input: InviteChildToClaimInput,
    ip?: string,
  ): Promise<void> {
    await this.deps.authz.assertRole(adminId, 'platform_admin');

    const child = await this.deps.users.findById(childId);
    if (!child || !child.managedByParentId) {
      throw new NotFoundError('Managed child not found');
    }

    const existing = await this.deps.users.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('This email address is already in use.', 'EMAIL_IN_USE');
    }

    const token = this.deps.tokens.generateOpaqueToken();
    await this.deps.tx.run(async (db) => {
      await this.deps.oneTimeTokens.issue({
        userId: childId,
        type: 'account_claim',
        tokenHash: token.hash,
        expiresAt: new Date(Date.now() + CLAIM_TTL_DAYS * 86_400_000),
      });
      await this.deps.users.setClaimInviteSentAt(
        childId,
        { at: new Date(), pendingClaimEmail: input.email },
        db,
      );
      await this.deps.audit.write(
        {
          action: 'child.claim_invited',
          actorUserId: adminId,
          entityType: 'user',
          entityId: childId,
          meta: { name: child.name },
          ip,
        },
        db,
      );
    });

    try {
      await this.deps.email.sendAccountClaimEmail({
        to: input.email,
        childName: child.name,
        claimUrl: `${this.deps.config.webOrigin}/claim-account?token=${token.raw}`,
      });
    } catch (err) {
      logger.error({ err, childId }, 'Account-claim email failed to send');
    }
  }

  async claimAccount(input: ClaimAccountInput): Promise<void> {
    const passwordHash = await argon2Hash(input.password);
    await this.deps.tx.run(async (db) => {
      const result = await this.deps.oneTimeTokens.consume(
        this.deps.tokens.hashToken(input.token),
        'account_claim',
        db,
      );
      if (result.outcome !== 'consumed') throw tokenErrorFrom(result);

      const child = await this.deps.users.findById(result.userId);
      if (!child || !child.pendingClaimEmail) {
        throw new AppError(400, 'TOKEN_INVALID', 'This link is not valid.');
      }
      const parentUserId = child.managedByParentId;

      await this.deps.users.claimAccount(
        result.userId,
        { email: child.pendingClaimEmail, passwordHash },
        db,
      );
      await this.deps.audit.write(
        {
          action: 'child.claimed_account',
          actorUserId: parentUserId,
          entityType: 'user',
          entityId: result.userId,
          meta: { name: child.name },
        },
        db,
      );
    });
  }

  async requestEmailChange(
    userId: string,
    newEmail: string,
    currentPassword: string,
  ): Promise<void> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    const valid = await argon2Verify(user.passwordHash, currentPassword);
    if (!valid) throw new UnauthorizedError('Incorrect password', 'INVALID_CREDENTIALS');
    if (newEmail === user.email) {
      throw new ConflictError(
        'New email must be different from your current email address.',
        'EMAIL_UNCHANGED',
      );
    }

    const existing = await this.deps.users.findByEmail(newEmail);
    if (existing) {
      throw new ConflictError('This email address is already in use.', 'EMAIL_IN_USE');
    }

    const token = this.deps.tokens.generateOpaqueToken();
    await this.deps.oneTimeTokens.issue({
      userId,
      type: 'email_change',
      tokenHash: token.hash,
      expiresAt: new Date(Date.now() + this.deps.config.verifyTtlHours * 3_600_000),
    });
    await this.deps.users.setPendingEmail(userId, newEmail);
    try {
      await this.deps.email.sendEmailChangeEmail({
        to: newEmail,
        name: user.name,
        confirmUrl: `${this.deps.config.webOrigin}/confirm-email-change?token=${token.raw}`,
      });
    } catch (err) {
      logger.error({ err, userId }, 'Email change confirmation email failed to send');
    }
  }

  async confirmEmailChange(token: string): Promise<void> {
    await this.deps.tx.run(async (db) => {
      const result = await this.deps.oneTimeTokens.consume(
        this.deps.tokens.hashToken(token),
        'email_change',
        db,
      );
      if (result.outcome !== 'consumed') throw tokenErrorFrom(result);

      const user = await this.deps.users.findById(result.userId);
      if (!user || !user.pendingEmail) {
        throw new AppError(400, 'TOKEN_INVALID', 'This link is not valid.');
      }
      const newEmail = user.pendingEmail;
      await this.deps.users.confirmEmailChange(result.userId, newEmail, db);
      await this.deps.audit.write(
        {
          action: 'auth.email_changed',
          actorUserId: result.userId,
          entityType: 'user',
          entityId: result.userId,
          meta: { newEmail },
        },
        db,
      );
    });
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.deps.config.refreshTtlDays * 86_400_000);
  }

  private async recordLoginFailure(key: string): Promise<void> {
    if (!this.deps.loginAttempts) return;
    const { tracker, limit } = this.deps.loginAttempts;
    const { count, resetTime } = await tracker.recordFailure(key);
    if (count > limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
      throw new RateLimitedError(retryAfterSeconds);
    }
  }
}
