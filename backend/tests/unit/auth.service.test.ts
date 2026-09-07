import { verify as argon2Verify } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError, ConflictError, UnauthorizedError } from '../../src/lib/errors';
import { makeLoginAttemptTracker } from '../../src/middleware/rateLimiters';
import { AuthService } from '../../src/modules/users-auth/auth.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { tokenService } from '../../src/modules/users-auth/token.service';
import {
  FakeAudit,
  FakeExternalInviteRepo,
  FakeNotificationRepo,
  FakeOneTimeTokenRepo,
  FakeRateLimitStore,
  FakeRefreshTokenRepo,
  FakeRoleRequestRepo,
  FakeUserRepo,
  MailboxAdapter,
  fakeTx,
  tokenFromUrl,
} from '../helpers/fakes';

const PASSWORD = 'CorrectHorse1';

function makeFakeTournamentInvitations() {
  const invitePlayerCalls: {
    actorId: string;
    tournamentId: string;
    userId: string;
    tournamentAgeGroupId: string;
  }[] = [];
  return {
    invitePlayerCalls,
    tournamentInvitations: {
      async invitePlayer(
        actorId: string,
        tournamentId: string,
        userId: string,
        tournamentAgeGroupId: string,
      ) {
        invitePlayerCalls.push({ actorId, tournamentId, userId, tournamentAgeGroupId });
        return {} as never;
      },
    },
  };
}

function makeService(opts?: { loginAttemptLimit: number }) {
  const users = new FakeUserRepo();
  const refreshTokens = new FakeRefreshTokenRepo();
  const oneTimeTokens = new FakeOneTimeTokenRepo();
  const externalInvites = new FakeExternalInviteRepo();
  const audit = new FakeAudit();
  const mailbox = new MailboxAdapter();
  const roleRequests = new FakeRoleRequestRepo(users);
  const notificationRepo = new FakeNotificationRepo();
  const notifications = new NotificationService({
    notifications: notificationRepo,
    users,
    email: mailbox,
  });
  const authz = new AuthzService(users);
  const { invitePlayerCalls, tournamentInvitations } = makeFakeTournamentInvitations();
  const loginAttempts = opts
    ? {
        tracker: makeLoginAttemptTracker(new FakeRateLimitStore('login'), 15 * 60_000),
        limit: opts.loginAttemptLimit,
      }
    : undefined;
  const service = new AuthService({
    users,
    refreshTokens,
    oneTimeTokens,
    tokens: tokenService,
    audit,
    email: mailbox,
    tx: fakeTx,
    roleRequests,
    notifications,
    authz,
    loginAttempts,
    externalInvites,
    tournamentInvitations,
    config: {
      webOrigin: 'http://web.test',
      accessTtlMin: 15,
      refreshTtlDays: 7,
      verifyTtlHours: 24,
      resetTtlMin: 60,
    },
  });
  return {
    service,
    users,
    refreshTokens,
    oneTimeTokens,
    externalInvites,
    invitePlayerCalls,
    audit,
    mailbox,
    roleRequests,
    notificationRepo,
  };
}

type Ctx = ReturnType<typeof makeService>;

async function signup(ctx: Ctx, email = 'pat@example.com') {
  return ctx.service.signup({ name: 'Pat', email, password: PASSWORD }, { ip: '1.2.3.4' });
}

async function verifiedSignup(ctx: Ctx, email = 'pat@example.com') {
  const dto = await signup(ctx, email);
  await ctx.users.setVerified(dto.id);
  return dto;
}

describe('AuthService — signup & email verification', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeService();
  });

  it('creates an unverified user with the default player role and sends a verification link', async () => {
    const user = await signup(ctx);
    expect(user.verified).toBe(false);
    expect(user.roles).toEqual(['player']);
    expect(ctx.mailbox.verifications).toHaveLength(1);
    expect(ctx.mailbox.verifications[0]!.to).toBe('pat@example.com');
    expect(ctx.mailbox.verifications[0]!.verifyUrl).toContain(
      'http://web.test/verify-email?token=',
    );
    expect(ctx.audit.actionsOf('auth.signup')).toHaveLength(1);
  });

  it('signup with a requestedRole still gets player immediately, plus a pending RoleRequest', async () => {
    const user = await ctx.service.signup(
      { name: 'Pat', email: 'pat@example.com', password: PASSWORD, requestedRole: 'ground_owner' },
      { ip: '1.2.3.4' },
    );
    expect(user.roles).toEqual(['player']);

    const pending = await ctx.roleRequests.findPendingForUser(user.id);
    expect(pending).toMatchObject({ requestedRole: 'ground_owner', status: 'pending' });

    expect(ctx.audit.entries.some((e) => e.action.startsWith('role_request'))).toBe(false);
  });

  it('signup without a requestedRole creates no RoleRequest row', async () => {
    const user = await signup(ctx);
    expect(await ctx.roleRequests.findPendingForUser(user.id)).toBeNull();
  });

  it('signup assigns a P-prefixed club id immediately (everyone starts as player)', async () => {
    const user = await signup(ctx);
    const row = await ctx.users.findById(user.id);
    expect(row?.clubId).toMatch(/^P-\d{6}$/);
  });

  it('a parentOnly signup gets a PT-prefixed club id, not P', async () => {
    const user = await ctx.service.signup(
      { name: 'Pat', email: 'pat@example.com', password: PASSWORD, parentOnly: true },
      { ip: '1.2.3.4' },
    );
    const row = await ctx.users.findById(user.id);
    expect(row?.clubId).toMatch(/^PT-\d{6}$/);
  });

  it('parentOnly grants ONLY parent, instant, no RoleRequest, no player role', async () => {
    const user = await ctx.service.signup(
      { name: 'Pat', email: 'pat@example.com', password: PASSWORD, parentOnly: true },
      { ip: '1.2.3.4' },
    );
    expect(user.roles).toEqual(['parent']);
    expect(await ctx.roleRequests.findPendingForUser(user.id)).toBeNull();
    expect(ctx.audit.entries.some((e) => e.action.startsWith('role_request'))).toBe(false);
  });

  it('never stores the plaintext password', async () => {
    const dto = await signup(ctx);
    const stored = ctx.users.users.get(dto.id)!;
    expect(stored.passwordHash).not.toContain(PASSWORD);
    expect(await argon2Verify(stored.passwordHash, PASSWORD)).toBe(true);
  });

  it('rejects a duplicate email with EMAIL_IN_USE', async () => {
    await signup(ctx);
    await expect(signup(ctx)).rejects.toMatchObject(
      new ConflictError('This email address is already in use.', 'EMAIL_IN_USE'),
    );
  });

  it('signup still succeeds if the verification email fails to send', async () => {
    ctx.mailbox.failNext = true;
    const user = await signup(ctx);
    expect(user.id).toBeTruthy();
    expect(ctx.mailbox.verifications).toHaveLength(0);
  });

  it('verifies the account via the emailed token', async () => {
    const dto = await signup(ctx);
    const token = tokenFromUrl(ctx.mailbox.verifications[0]!.verifyUrl);
    await ctx.service.verifyEmail(token);
    expect(ctx.users.users.get(dto.id)!.verified).toBe(true);
  });

  it('rejects a reused verification link with TOKEN_ALREADY_USED', async () => {
    await signup(ctx);
    const token = tokenFromUrl(ctx.mailbox.verifications[0]!.verifyUrl);
    await ctx.service.verifyEmail(token);
    await expect(ctx.service.verifyEmail(token)).rejects.toMatchObject({
      code: 'TOKEN_ALREADY_USED',
    });
  });

  it('rejects an expired verification link with TOKEN_EXPIRED and leaves the user unverified', async () => {
    const dto = await signup(ctx);
    const token = tokenFromUrl(ctx.mailbox.verifications[0]!.verifyUrl);
    for (const row of ctx.oneTimeTokens.rows.values()) row.expiresAt = new Date(Date.now() - 1000);
    await expect(ctx.service.verifyEmail(token)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(ctx.users.users.get(dto.id)!.verified).toBe(false);
  });

  it('rejects a garbage token with TOKEN_INVALID', async () => {
    await expect(ctx.service.verifyEmail('garbage')).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('issuing a new verification link invalidates the previous one (latest link wins)', async () => {
    await signup(ctx);
    const first = tokenFromUrl(ctx.mailbox.verifications[0]!.verifyUrl);
    await ctx.service.resendVerification('pat@example.com');
    await expect(ctx.service.verifyEmail(first)).rejects.toBeInstanceOf(AppError);
    const second = tokenFromUrl(ctx.mailbox.verifications[1]!.verifyUrl);
    await ctx.service.verifyEmail(second);
  });
});

describe('AuthService — external invite signup', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeService();
  });

  async function makeInvite(overrides?: {
    email?: string;
    role?: 'player' | 'team_manager';
    tournamentId?: string | null;
    tournamentAgeGroupId?: string | null;
    invitedByOrganizerId?: string;
    expiresAt?: Date;
  }) {
    const token = tokenService.generateOpaqueToken();
    await ctx.externalInvites.create({
      email: 'pat@example.com',
      role: 'team_manager',
      tournamentId: null,
      tournamentAgeGroupId: null,
      invitedByOrganizerId: 'org-1',
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      ...overrides,
      tokenHash: token.hash,
    });
    return token.raw;
  }

  it('a team_manager invite grants team_manager only, replacing the default player', async () => {
    const raw = await makeInvite({ role: 'team_manager' });
    const user = await ctx.service.signup(
      { name: 'Pat', email: 'pat@example.com', password: PASSWORD, inviteToken: raw },
      { ip: '1.2.3.4' },
    );
    expect(user.roles).toEqual(['team_manager']);
  });

  it('notifies the inviting organizer once the team manager signs up', async () => {
    const raw = await makeInvite({
      role: 'team_manager',
      invitedByOrganizerId: 'org-1',
      tournamentId: 'tournament-1',
    });
    await ctx.service.signup(
      { name: 'Pat', email: 'pat@example.com', password: PASSWORD, inviteToken: raw },
      { ip: '1.2.3.4' },
    );
    const notifs = [...ctx.notificationRepo.rows.values()].filter((n) => n.userId === 'org-1');
    expect(notifs).toHaveLength(1);
    expect(notifs[0]!.type).toBe('external_invite_joined');
    expect(notifs[0]!.payload).toMatchObject({ tournamentId: 'tournament-1' });
  });

  it('also notifies the NEW manager themself, naming the tournament that invited them', async () => {
    await ctx.users.create({
      name: 'Olivia Organizer',
      email: 'organizer@example.com',
      passwordHash: 'x',
      roleIds: [2],
    });
    const organizerId = (await ctx.users.findByEmail('organizer@example.com'))!.id;
    ctx.externalInvites.tournamentNames.set('tourn-1', 'Summer Cup');
    const raw = await makeInvite({
      role: 'team_manager',
      tournamentId: 'tourn-1',
      invitedByOrganizerId: organizerId,
    });
    const user = await ctx.service.signup(
      { name: 'Pat', email: 'pat@example.com', password: PASSWORD, inviteToken: raw },
      { ip: '1.2.3.4' },
    );
    const notifs = [...ctx.notificationRepo.rows.values()].filter((n) => n.userId === user.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({
      type: 'team_manager_invite_pending',
      body: 'Olivia Organizer invited you to manage a team for Summer Cup. Create a team to see your invitation.',
      payload: { tournamentId: 'tourn-1' },
    });
  });

  it('skips the new-manager notification when the invite carries no tournament (a direct role grant, not this signup flow)', async () => {
    const raw = await makeInvite({ role: 'team_manager', tournamentId: null });
    const user = await ctx.service.signup(
      { name: 'Pat', email: 'pat@example.com', password: PASSWORD, inviteToken: raw },
      { ip: '1.2.3.4' },
    );
    const notifs = [...ctx.notificationRepo.rows.values()].filter((n) => n.userId === user.id);
    expect(notifs).toHaveLength(0);
  });

  it('a player invite keeps the default player role and fires the real tournament invitation', async () => {
    const raw = await makeInvite({
      role: 'player',
      tournamentId: 'tourn-1',
      tournamentAgeGroupId: 'tag-1',
      invitedByOrganizerId: 'org-1',
    });
    const user = await ctx.service.signup(
      { name: 'Pat', email: 'pat@example.com', password: PASSWORD, inviteToken: raw },
      { ip: '1.2.3.4' },
    );
    expect(user.roles).toEqual(['player']);
    expect(ctx.invitePlayerCalls).toEqual([
      { actorId: 'org-1', tournamentId: 'tourn-1', userId: user.id, tournamentAgeGroupId: 'tag-1' },
    ]);
  });

  it('records who claimed the invite and marks it fulfilled', async () => {
    const raw = await makeInvite({ role: 'team_manager' });
    const user = await ctx.service.signup(
      { name: 'Pat', email: 'pat@example.com', password: PASSWORD, inviteToken: raw },
      { ip: '1.2.3.4' },
    );
    const invite = [...ctx.externalInvites.rows.values()][0]!;
    expect(invite.claimedByUserId).toBe(user.id);
    expect(invite.status).toBe('fulfilled');
  });

  it('rejects a mismatched email with INVITE_EMAIL_MISMATCH, without creating a user', async () => {
    const raw = await makeInvite({ role: 'team_manager', email: 'invited@example.com' });
    await expect(
      ctx.service.signup(
        { name: 'Pat', email: 'someone-else@example.com', password: PASSWORD, inviteToken: raw },
        { ip: '1.2.3.4' },
      ),
    ).rejects.toMatchObject({ code: 'INVITE_EMAIL_MISMATCH' });
    expect(await ctx.users.findByEmail('someone-else@example.com')).toBeNull();
  });

  it('rejects an already-used invite token', async () => {
    const raw = await makeInvite({ role: 'team_manager' });
    await ctx.service.signup(
      { name: 'Pat', email: 'pat@example.com', password: PASSWORD, inviteToken: raw },
      { ip: '1.2.3.4' },
    );
    await expect(
      ctx.service.signup(
        { name: 'Pat 2', email: 'pat2@example.com', password: PASSWORD, inviteToken: raw },
        { ip: '1.2.3.4' },
      ),
    ).rejects.toMatchObject({ code: 'TOKEN_ALREADY_USED' });
  });

  it('rejects an expired invite token', async () => {
    const raw = await makeInvite({
      role: 'team_manager',
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      ctx.service.signup(
        { name: 'Pat', email: 'pat@example.com', password: PASSWORD, inviteToken: raw },
        { ip: '1.2.3.4' },
      ),
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('rejects a garbage invite token', async () => {
    await expect(
      ctx.service.signup(
        { name: 'Pat', email: 'pat@example.com', password: PASSWORD, inviteToken: 'garbage' },
        { ip: '1.2.3.4' },
      ),
    ).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });
});

describe('AuthService — login', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = makeService();
    await verifiedSignup(ctx);
  });

  it('rejects login for an unverified account with EMAIL_NOT_VERIFIED', async () => {
    await signup(ctx, 'unverified@example.com');
    await expect(
      ctx.service.login({ email: 'unverified@example.com', password: PASSWORD }, {}),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });

  it('returns the SAME generic error for unknown email and wrong password', async () => {
    const unknownEmail = ctx.service
      .login({ email: 'nobody@example.com', password: PASSWORD }, {})
      .catch((e: unknown) => e);
    const wrongPassword = ctx.service
      .login({ email: 'pat@example.com', password: 'WrongPass1' }, {})
      .catch((e: unknown) => e);
    const [a, b] = (await Promise.all([unknownEmail, wrongPassword])) as [
      UnauthorizedError,
      UnauthorizedError,
    ];
    expect(a).toBeInstanceOf(UnauthorizedError);
    expect(b).toBeInstanceOf(UnauthorizedError);
    expect(a.code).toBe('INVALID_CREDENTIALS');
    expect(a.code).toBe(b.code);
    expect(a.message).toBe(b.message);
  });

  it('issues a working access token and stores only the refresh-token hash', async () => {
    const result = await ctx.service.login({ email: 'pat@example.com', password: PASSWORD }, {});
    const { userId } = await tokenService.verifyAccessToken(result.accessToken);
    expect(userId).toBe(result.user.id);
    expect(result.user.roles).toEqual(['player']);

    const raws = [...ctx.refreshTokens.rows.values()].map((r) => r.tokenHash);
    expect(raws).not.toContain(result.refreshToken.raw);
    expect(raws).toContain(tokenService.hashToken(result.refreshToken.raw));
  });
});

describe('AuthService — login attempt limiting', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = makeService({ loginAttemptLimit: 2 });
    await verifiedSignup(ctx, 'pat@example.com');
    await verifiedSignup(ctx, 'sam@example.com');
  });

  it('blocks further WRONG attempts on the same IP+account once over the limit', async () => {
    const attempt = () =>
      ctx.service
        .login({ email: 'pat@example.com', password: 'WrongPass1' }, { ip: '9.9.9.9' })
        .catch((e: unknown) => e);
    await attempt();
    await attempt();
    const third = await attempt();
    expect(third).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('always accepts a CORRECT password, even after the wrong-attempt limit was exceeded on that account', async () => {
    const wrongLogin = () =>
      ctx.service
        .login({ email: 'pat@example.com', password: 'WrongPass1' }, { ip: '9.9.9.9' })
        .catch((e: unknown) => e);
    await wrongLogin();
    await wrongLogin();
    const overLimit = await wrongLogin();
    expect(overLimit).toMatchObject({ code: 'RATE_LIMITED' });

    const result = await ctx.service.login(
      { email: 'pat@example.com', password: PASSWORD },
      { ip: '9.9.9.9' },
    );
    expect(result.user.email).toBe('pat@example.com');
  });

  it("does not let one account's wrong attempts on an IP block a DIFFERENT account on the same IP", async () => {
    const wrongLogin = () =>
      ctx.service
        .login({ email: 'pat@example.com', password: 'WrongPass1' }, { ip: '9.9.9.9' })
        .catch((e: unknown) => e);
    await wrongLogin();
    await wrongLogin();
    const overLimit = await wrongLogin();
    expect(overLimit).toMatchObject({ code: 'RATE_LIMITED' });

    const result = await ctx.service.login(
      { email: 'sam@example.com', password: PASSWORD },
      { ip: '9.9.9.9' },
    );
    expect(result.user.email).toBe('sam@example.com');
  });

  it("a successful login clears the account's own failure count", async () => {
    const wrongLogin = () =>
      ctx.service
        .login({ email: 'pat@example.com', password: 'WrongPass1' }, { ip: '9.9.9.9' })
        .catch((e: unknown) => e);
    await wrongLogin();
    await ctx.service.login({ email: 'pat@example.com', password: PASSWORD }, { ip: '9.9.9.9' });

    const secondWrong = await wrongLogin();
    expect(secondWrong).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});

describe('AuthService — refresh rotation & theft detection', () => {
  let ctx: Ctx;
  let firstRaw: string;
  let userId: string;

  beforeEach(async () => {
    ctx = makeService();
    await verifiedSignup(ctx);
    const login = await ctx.service.login({ email: 'pat@example.com', password: PASSWORD }, {});
    firstRaw = login.refreshToken.raw;
    userId = login.user.id;
  });

  it('rotates: new token works, old token is retired', async () => {
    const r1 = await ctx.service.refresh(firstRaw, {});
    expect(r1.refreshToken.raw).not.toBe(firstRaw);
    const r2 = await ctx.service.refresh(r1.refreshToken.raw, {});
    expect(r2.user.id).toBe(userId);
  });

  it('REUSE of a rotated token revokes every session and writes an audit entry', async () => {
    const r1 = await ctx.service.refresh(firstRaw, {});

    await expect(ctx.service.refresh(firstRaw, {})).rejects.toMatchObject({
      code: 'INVALID_REFRESH',
    });

    await expect(ctx.service.refresh(r1.refreshToken.raw, {})).rejects.toMatchObject({
      code: 'INVALID_REFRESH',
    });
    expect(ctx.refreshTokens.activeCountFor(userId)).toBe(0);
    expect(ctx.audit.actionsOf('auth.refresh_reuse_detected')).toHaveLength(1);
  });

  it('rejects a missing, expired, or revoked token', async () => {
    await expect(ctx.service.refresh(undefined, {})).rejects.toMatchObject({
      code: 'INVALID_REFRESH',
    });
    for (const row of ctx.refreshTokens.rows.values()) row.expiresAt = new Date(Date.now() - 1);
    await expect(ctx.service.refresh(firstRaw, {})).rejects.toMatchObject({
      code: 'INVALID_REFRESH',
    });
  });

  it('logout revokes the family; the token no longer refreshes; logout is idempotent', async () => {
    await ctx.service.logout(firstRaw);
    await expect(ctx.service.refresh(firstRaw, {})).rejects.toMatchObject({
      code: 'INVALID_REFRESH',
    });
    await ctx.service.logout(firstRaw);
    await ctx.service.logout(undefined);
  });
});

describe('AuthService — password reset', () => {
  let ctx: Ctx;
  let userId: string;

  beforeEach(async () => {
    ctx = makeService();
    const dto = await verifiedSignup(ctx);
    userId = dto.id;
  });

  it('forgotPassword for an unknown email resolves quietly without sending mail', async () => {
    await ctx.service.forgotPassword('nobody@example.com');
    expect(ctx.mailbox.resets).toHaveLength(0);
  });

  it('resets the password, kills every session, invalidates the link, audits — atomically', async () => {
    await ctx.service.login({ email: 'pat@example.com', password: PASSWORD }, {});
    await ctx.service.forgotPassword('pat@example.com');
    const token = tokenFromUrl(ctx.mailbox.resets[0]!.resetUrl);

    await ctx.service.resetPassword({ token, password: 'NewPassword9' }, {});

    await expect(
      ctx.service.login({ email: 'pat@example.com', password: PASSWORD }, {}),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const login = await ctx.service.login(
      { email: 'pat@example.com', password: 'NewPassword9' },
      {},
    );
    expect(login.user.id).toBe(userId);

    expect(ctx.users.users.get(userId)!.passwordChangedAt).not.toBeNull();
    expect(ctx.audit.actionsOf('auth.password_reset')).toHaveLength(1);

    await expect(
      ctx.service.resetPassword({ token, password: 'AnotherPass1' }, {}),
    ).rejects.toMatchObject({ code: 'TOKEN_ALREADY_USED' });
  });

  it('reset revokes all pre-existing sessions', async () => {
    const s1 = await ctx.service.login({ email: 'pat@example.com', password: PASSWORD }, {});
    const s2 = await ctx.service.login({ email: 'pat@example.com', password: PASSWORD }, {});
    await ctx.service.forgotPassword('pat@example.com');
    const token = tokenFromUrl(ctx.mailbox.resets[0]!.resetUrl);
    await ctx.service.resetPassword({ token, password: 'NewPassword9' }, {});

    await expect(ctx.service.refresh(s1.refreshToken.raw, {})).rejects.toMatchObject({
      code: 'INVALID_REFRESH',
    });
    await expect(ctx.service.refresh(s2.refreshToken.raw, {})).rejects.toMatchObject({
      code: 'INVALID_REFRESH',
    });
  });

  it('rejects an expired reset link', async () => {
    await ctx.service.forgotPassword('pat@example.com');
    const token = tokenFromUrl(ctx.mailbox.resets[0]!.resetUrl);
    for (const row of ctx.oneTimeTokens.rows.values()) row.expiresAt = new Date(Date.now() - 1);
    await expect(
      ctx.service.resetPassword({ token, password: 'NewPassword9' }, {}),
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });
});

describe('AuthService — account claim (admin → managed child)', () => {
  let ctx: Ctx;
  let parentId: string;
  let adminId: string;
  let childId: string;

  beforeEach(async () => {
    ctx = makeService();
    const parent = await verifiedSignup(ctx, 'parent@example.com');
    parentId = parent.id;
    const child = await ctx.users.create({
      name: 'Kid',
      email: 'managed-kid@no-login.nforcearena.internal',
      passwordHash: 'unusable',
      roleIds: [3],
      dateOfBirth: new Date('2015-01-01'),
      managedByParentId: parentId,
    });
    childId = child.id;
    const admin = await ctx.users.create({
      name: 'Ada Admin',
      email: 'ada-admin@example.com',
      passwordHash: 'unusable',
      roleIds: [1],
    });
    adminId = admin.id;
  });

  it('sends a claim invite, stamps claimInviteSentAt + pendingClaimEmail, and audits it', async () => {
    await ctx.service.inviteChildToClaim(
      adminId,
      childId,
      { email: 'kid-real@example.com' },
      '1.2.3.4',
    );
    expect(ctx.mailbox.claims).toHaveLength(1);
    expect(ctx.mailbox.claims[0]).toMatchObject({
      to: 'kid-real@example.com',
      childName: 'Kid',
    });
    expect(ctx.mailbox.claims[0]!.claimUrl).toContain('http://web.test/claim-account?token=');

    const row = ctx.users.users.get(childId)!;
    expect(row.claimInviteSentAt).not.toBeNull();
    expect(row.pendingClaimEmail).toBe('kid-real@example.com');
    expect(row.managedByParentId).toBe(parentId);

    const entries = ctx.audit.actionsOf('child.claim_invited');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorUserId: adminId, entityId: childId, ip: '1.2.3.4' });
  });

  it('rejects inviteChildToClaim from the child’s own parent — admin-only now', async () => {
    await expect(
      ctx.service.inviteChildToClaim(parentId, childId, { email: 'kid-real@example.com' }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('rejects inviteChildToClaim from any other non-admin caller', async () => {
    const otherParent = await verifiedSignup(ctx, 'other-parent@example.com');
    await expect(
      ctx.service.inviteChildToClaim(otherParent.id, childId, { email: 'kid-real@example.com' }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('rejects inviting to an email address already in use', async () => {
    await expect(
      ctx.service.inviteChildToClaim(adminId, childId, { email: 'parent@example.com' }),
    ).rejects.toMatchObject({ code: 'EMAIL_IN_USE' });
  });

  it('claimAccount promotes the pending email, sets a password, verifies, and severs the parent link', async () => {
    await ctx.service.inviteChildToClaim(adminId, childId, { email: 'kid-real@example.com' });
    const token = tokenFromUrl(ctx.mailbox.claims[0]!.claimUrl);

    await ctx.service.claimAccount({ token, password: 'NewKidPass1' });

    const row = ctx.users.users.get(childId)!;
    expect(row.email).toBe('kid-real@example.com');
    expect(row.verified).toBe(true);
    expect(row.managedByParentId).toBeNull();
    expect(row.pendingClaimEmail).toBeNull();
    expect(await ctx.users.getRoleNames(childId)).toContain('player');

    const login = await ctx.service.login(
      { email: 'kid-real@example.com', password: 'NewKidPass1' },
      {},
    );
    expect(login.user.id).toBe(childId);

    const entries = ctx.audit.actionsOf('child.claimed_account');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorUserId: parentId, entityId: childId });
  });

  it('the claim link is single-use', async () => {
    await ctx.service.inviteChildToClaim(adminId, childId, { email: 'kid-real@example.com' });
    const token = tokenFromUrl(ctx.mailbox.claims[0]!.claimUrl);
    await ctx.service.claimAccount({ token, password: 'NewKidPass1' });
    await expect(
      ctx.service.claimAccount({ token, password: 'AnotherPass1' }),
    ).rejects.toMatchObject({ code: 'TOKEN_ALREADY_USED' });
  });

  it('rejects an expired claim link', async () => {
    await ctx.service.inviteChildToClaim(adminId, childId, { email: 'kid-real@example.com' });
    const token = tokenFromUrl(ctx.mailbox.claims[0]!.claimUrl);
    for (const row of ctx.oneTimeTokens.rows.values()) row.expiresAt = new Date(Date.now() - 1);
    await expect(
      ctx.service.claimAccount({ token, password: 'NewKidPass1' }),
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it("a managed child's synthetic email can never log in, even before claiming — defense in depth", async () => {
    const row = ctx.users.users.get(childId)!;
    await expect(
      ctx.service.login({ email: row.email, password: 'anything' }, {}),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(ctx.service.forgotPassword(row.email)).resolves.toBeUndefined();
    expect(ctx.mailbox.resets).toHaveLength(0);
  });
});

describe('AuthService — self-service email change', () => {
  let ctx: Ctx;
  let userId: string;

  beforeEach(async () => {
    ctx = makeService();
    const dto = await verifiedSignup(ctx);
    userId = dto.id;
  });

  it('rejects an incorrect current password without sending anything', async () => {
    await expect(
      ctx.service.requestEmailChange(userId, 'new@example.com', 'WrongPassword1'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(ctx.mailbox.emailChanges).toHaveLength(0);
  });

  it('refuses an address already in use', async () => {
    await verifiedSignup(ctx, 'taken@example.com');
    await expect(
      ctx.service.requestEmailChange(userId, 'taken@example.com', PASSWORD),
    ).rejects.toMatchObject({ code: 'EMAIL_IN_USE' });
  });

  it('rejects a "change" to the address already on the account', async () => {
    await expect(
      ctx.service.requestEmailChange(userId, 'pat@example.com', PASSWORD),
    ).rejects.toMatchObject({ code: 'EMAIL_UNCHANGED' });
    expect(ctx.mailbox.emailChanges).toHaveLength(0);
  });

  it('sends the confirmation link to the NEW address, not the old one', async () => {
    await ctx.service.requestEmailChange(userId, 'new@example.com', PASSWORD);
    expect(ctx.mailbox.emailChanges).toHaveLength(1);
    expect(ctx.mailbox.emailChanges[0]!.to).toBe('new@example.com');
    expect(ctx.users.users.get(userId)!.email).toBe('pat@example.com');
    expect(ctx.users.users.get(userId)!.pendingEmail).toBe('new@example.com');
  });

  it('confirming switches the email over, marks it verified, audits it, and the link is single-use', async () => {
    await ctx.service.requestEmailChange(userId, 'new@example.com', PASSWORD);
    const token = tokenFromUrl(ctx.mailbox.emailChanges[0]!.confirmUrl);

    await ctx.service.confirmEmailChange(token);

    const user = ctx.users.users.get(userId)!;
    expect(user.email).toBe('new@example.com');
    expect(user.pendingEmail).toBeNull();
    expect(user.verified).toBe(true);
    expect(ctx.audit.actionsOf('auth.email_changed')).toHaveLength(1);

    await expect(
      ctx.service.login({ email: 'pat@example.com', password: PASSWORD }, {}),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const login = await ctx.service.login({ email: 'new@example.com', password: PASSWORD }, {});
    expect(login.user.id).toBe(userId);

    await expect(ctx.service.confirmEmailChange(token)).rejects.toMatchObject({
      code: 'TOKEN_ALREADY_USED',
    });
  });

  it('rejects an expired confirmation link', async () => {
    await ctx.service.requestEmailChange(userId, 'new@example.com', PASSWORD);
    const token = tokenFromUrl(ctx.mailbox.emailChanges[0]!.confirmUrl);
    for (const row of ctx.oneTimeTokens.rows.values()) row.expiresAt = new Date(Date.now() - 1);
    await expect(ctx.service.confirmEmailChange(token)).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
  });
});
