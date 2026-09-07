import type { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import { ConsoleEmailAdapter } from './adapters/email/ConsoleEmailAdapter';
import type { EmailAdapter } from './adapters/email/EmailAdapter';
import { SesEmailAdapter } from './adapters/email/SesEmailAdapter';
import { env } from './config/env';
import { makeTxRunner } from './lib/db';
import { logger } from './lib/logger';
import { prisma as defaultPrisma } from './lib/prisma';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import {
  DEFAULT_AUTH_RATE_LIMIT,
  makeAuthRateLimiter,
  makeLoginAttemptTracker,
  PostgresRateLimitStore,
  type RateLimitConfig,
  type WindowedStore as RateLimitStore,
} from './middleware/rateLimiters';
import { requestId } from './middleware/requestId';
import { requestLogger } from './middleware/requestLogger';
import { makeOptionalAuth, makeRequireAuth } from './middleware/requireAuth';
import { PrismaAgeGroupRepo } from './modules/ageGroups/ageGroup.repo';
import { AgeGroupService } from './modules/ageGroups/ageGroup.service';
import { buildAgeGroupRoutes } from './modules/ageGroups/ageGroups.routes';
import { PrismaSurfaceTypeRepo } from './modules/surfaceTypes/surfaceType.repo';
import { SurfaceTypeService } from './modules/surfaceTypes/surfaceType.service';
import { buildSurfaceTypeRoutes } from './modules/surfaceTypes/surfaceTypes.routes';
import { PrismaAuditRepo } from './modules/audit/audit.repo';
import { AuditQueryService, buildAdminAuditRoutes } from './modules/audit/audit.routes';
import { PrismaAuditService } from './modules/audit/audit.service';
import {
  AnnouncementService,
  PrismaAnnouncementRepo,
} from './modules/notifications/announcement.service';
import { PrismaNotificationRepo } from './modules/notifications/notification.repo';
import { NotificationService } from './modules/notifications/notification.service';
import {
  buildAnnouncementRoutes,
  buildNotificationRoutes,
} from './modules/notifications/notifications.routes';
import { PrismaFixtureRepo } from './modules/fixtures/fixture.repo';
import { FixtureService } from './modules/fixtures/fixture.service';
import {
  buildFixtureRoutes,
  buildTournamentFixtureRoutes,
  buildUmpireRoutes,
} from './modules/fixtures/fixtures.routes';
import { UmpireService } from './modules/fixtures/umpire.service';
import { PrismaUmpireAssignmentRepo } from './modules/fixtures/umpireAssignment.repo';
import { PrismaBookingRepo } from './modules/grounds/booking.repo';
import { BookingService } from './modules/grounds/booking.service';
import { PrismaGroundRepo } from './modules/grounds/ground.repo';
import { GroundService } from './modules/grounds/ground.service';
import { buildBookingRoutes, buildGroundRoutes } from './modules/grounds/grounds.routes';
import { PrismaPlayerProfileRepo } from './modules/players/playerProfile.repo';
import { PlayerProfileService } from './modules/players/playerProfile.service';
import { buildPlayerSearchRoutes, buildPublicPlayerRoutes } from './modules/players/players.routes';
import { PrismaResultRepo } from './modules/results/result.repo';
import { ResultService } from './modules/results/result.service';
import { buildResultRoutes } from './modules/results/results.routes';
import { PrismaRegistrationRepo } from './modules/registrations/registration.repo';
import {
  buildRegistrationWithdrawRoutes,
  buildTournamentRegistrationRoutes,
} from './modules/registrations/registration.routes';
import { RegistrationService } from './modules/registrations/registration.service';
import { PrismaTournamentInvitationRepo } from './modules/registrations/tournamentInvitation.repo';
import {
  buildPlayerInvitationResponseRoutes,
  buildTeamInvitationResponseRoutes,
  buildTeamInvitationRoutes,
  buildTournamentInvitationRoutes,
} from './modules/registrations/tournamentInvitation.routes';
import { TournamentInvitationService } from './modules/registrations/tournamentInvitation.service';
import { PrismaExternalInviteRepo } from './modules/registrations/externalInvite.repo';
import {
  buildExternalInviteOrganizerRoutes,
  buildExternalInviteRoutes,
} from './modules/registrations/externalInvite.routes';
import { ExternalInviteService } from './modules/registrations/externalInvite.service';
import { PrismaTeamRepo } from './modules/teams/team.repo';
import { TeamService } from './modules/teams/team.service';
import { buildDraftTeamRoutes, buildTeamRoutes } from './modules/teams/teams.routes';
import { ParentService } from './modules/parents/parent.service';
import { buildAdminChildRoutes, buildParentRoutes } from './modules/parents/parent.routes';
import { PrismaOrganizerTournamentRepo } from './modules/tournaments/organizerTournament.repo';
import { buildOrganizerTournamentRoutes } from './modules/tournaments/organizerTournament.routes';
import { OrganizerTournamentService } from './modules/tournaments/organizerTournament.service';
import { buildPublicTournamentRoutes } from './modules/tournaments/public.routes';
import { PublicTournamentService } from './modules/tournaments/public.service';
import { PrismaTournamentRepo } from './modules/tournaments/tournament.repo';
import { buildAuthRoutes } from './modules/users-auth/auth.routes';
import { AuthService } from './modules/users-auth/auth.service';
import { AuthzService } from './modules/users-auth/authz.service';
import { PrismaOneTimeTokenRepo } from './modules/users-auth/oneTimeToken.repo';
import { PrismaRefreshTokenRepo } from './modules/users-auth/refreshToken.repo';
import { tokenService } from './modules/users-auth/token.service';
import { PrismaUserRepo } from './modules/users-auth/user.repo';
import { buildAdminUserRoutes, buildUserRoutes } from './modules/users-auth/users.routes';
import { LocalDiskStorageAdapter } from './adapters/storage/LocalDiskStorageAdapter';
import { S3StorageAdapter } from './adapters/storage/S3StorageAdapter';
import type { StorageAdapter } from './adapters/storage/StorageAdapter';
import { buildFileRoutes } from './modules/files/files.routes';
import { UsersService } from './modules/users-auth/users.service';
import { PrismaRoleRequestRepo } from './modules/users-auth/roleRequest.repo';
import { RoleRequestService } from './modules/users-auth/roleRequest.service';
import {
  buildAdminRoleRequestRoutes,
  buildRoleRequestRoutes,
} from './modules/users-auth/roleRequest.routes';
import { PrismaContactMessageRepo } from './modules/contact/contact.repo';
import { ContactService } from './modules/contact/contact.service';
import { buildAdminContactRoutes, buildContactRoutes } from './modules/contact/contact.routes';

export interface AppDeps {
  prisma?: PrismaClient;
  email?: EmailAdapter;
  dbPing?: () => Promise<number>;
  rateLimit?: RateLimitConfig | false;
  cors?: boolean;
  rateLimitStoreFactory?: (prefix: string) => RateLimitStore;
  storage?: StorageAdapter;
}

function buildDefaultEmailAdapter(): EmailAdapter {
  if (env.EMAIL_ADAPTER === 'ses') {
    return new SesEmailAdapter(env.EMAIL_FROM, logger, env.WEB_ORIGIN);
  }
  return new ConsoleEmailAdapter();
}

function buildDefaultStorageAdapter(): StorageAdapter {
  if (env.STORAGE_ADAPTER === 's3') {
    if (!env.S3_BUCKET) {
      throw new Error('S3_BUCKET is required when STORAGE_ADAPTER=s3');
    }
    return new S3StorageAdapter(env.S3_BUCKET);
  }
  const uploadDir = process.env.AWS_LAMBDA_FUNCTION_NAME ? '/tmp/uploads' : env.UPLOAD_DIR;
  return new LocalDiskStorageAdapter(uploadDir, env.JWT_SECRET, env.PUBLIC_API_BASE_URL);
}

export function buildApp(deps: AppDeps = {}): Express {
  const db = deps.prisma ?? defaultPrisma;
  const email = deps.email ?? buildDefaultEmailAdapter();
  const storage = deps.storage ?? buildDefaultStorageAdapter();

  const audit = new PrismaAuditService(db);
  const tx = makeTxRunner(db);
  const usersRepo = new PrismaUserRepo(db);
  const authz = new AuthzService(usersRepo);
  const roleRequestRepo = new PrismaRoleRequestRepo(db);
  const notificationService = new NotificationService({
    notifications: new PrismaNotificationRepo(db),
    users: usersRepo,
    email,
  });

  const rlConfig = deps.rateLimit === false ? null : (deps.rateLimit ?? DEFAULT_AUTH_RATE_LIMIT);
  const rateLimitStoreFactory =
    deps.rateLimitStoreFactory ?? ((prefix: string) => new PostgresRateLimitStore(db, prefix));
  const loginAttempts = rlConfig
    ? {
        tracker: makeLoginAttemptTracker(rateLimitStoreFactory('login'), rlConfig.windowMs),
        limit: rlConfig.limit,
      }
    : undefined;

  const externalInviteRepo = new PrismaExternalInviteRepo(db);
  const tournamentInvitationsRef: {
    current?: Pick<TournamentInvitationService, 'invitePlayer' | 'invite'>;
  } = {};
  const playerProfileServiceRef: { current?: Pick<PlayerProfileService, 'getProfile'> } = {};

  const authService = new AuthService({
    users: usersRepo,
    refreshTokens: new PrismaRefreshTokenRepo(db),
    oneTimeTokens: new PrismaOneTimeTokenRepo(db),
    tokens: tokenService,
    audit,
    email,
    tx,
    roleRequests: roleRequestRepo,
    notifications: notificationService,
    authz,
    loginAttempts,
    externalInvites: externalInviteRepo,
    tournamentInvitations: {
      invitePlayer: (...args) => tournamentInvitationsRef.current!.invitePlayer(...args),
    },
    config: {
      webOrigin: env.WEB_ORIGIN,
      accessTtlMin: env.ACCESS_TOKEN_TTL_MIN,
      refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      verifyTtlHours: env.VERIFY_TOKEN_TTL_HOURS,
      resetTtlMin: env.RESET_TOKEN_TTL_MIN,
    },
  });
  const usersService = new UsersService({
    users: usersRepo,
    authz,
    audit,
    tx,
    auth: authService,
    storage,
    notifications: notificationService,
  });
  const roleRequestService = new RoleRequestService({
    roleRequests: roleRequestRepo,
    users: usersService,
    authz,
    notifications: notificationService,
    audit,
    tx,
  });
  const contactService = new ContactService({
    contactMessages: new PrismaContactMessageRepo(db),
    users: usersService,
    authz,
    notifications: notificationService,
    audit,
    tx,
  });
  const requireAuth = makeRequireAuth(usersRepo, tokenService);
  const optionalAuth = makeOptionalAuth(usersRepo, tokenService);
  const publicTournaments = new PublicTournamentService(new PrismaTournamentRepo(db), storage);
  const announcementService = new AnnouncementService({
    announcements: new PrismaAnnouncementRepo(db),
    users: usersRepo,
    notifications: notificationService,
    authz,
    audit,
    tx,
  });
  const auditQuery = new AuditQueryService(new PrismaAuditRepo(db), authz);
  const ageGroupService = new AgeGroupService({
    ageGroups: new PrismaAgeGroupRepo(db),
    authz,
    audit,
  });
  const surfaceTypeService = new SurfaceTypeService({
    surfaceTypes: new PrismaSurfaceTypeRepo(db),
    authz,
    audit,
  });
  const organizerTournamentRepo = new PrismaOrganizerTournamentRepo(db);
  const registrationRepo = new PrismaRegistrationRepo(db);
  const teamRepo = new PrismaTeamRepo(db);
  const fixtureRepo = new PrismaFixtureRepo(db);
  const resultRepo = new PrismaResultRepo(db);
  const organizerTournamentService = new OrganizerTournamentService({
    tournaments: organizerTournamentRepo,
    authz,
    audit,
    tx,
    notifications: notificationService,
    users: usersRepo,
    storage,
    registrations: registrationRepo,
    teams: teamRepo,
  });
  const parentService = new ParentService({
    users: usersRepo,
    usersService,
    authz,
    audit,
    tx,
    teams: teamRepo,
    fixtures: fixtureRepo,
    results: resultRepo,
  });
  const registrationService = new RegistrationService({
    registrations: registrationRepo,
    users: usersRepo,
    teams: teamRepo,
    tournaments: organizerTournamentRepo,
    notifications: notificationService,
    authz,
    audit,
    tx,
    parents: parentService,
    playerProfile: {
      getProfile: (...args) => playerProfileServiceRef.current!.getProfile(...args),
    },
  });
  const teamService = new TeamService({
    teams: teamRepo,
    users: usersRepo,
    notifications: notificationService,
    authz,
    audit,
    tx,
    parents: parentService,
    registrations: registrationService,
    tournaments: organizerTournamentRepo,
    externalInvites: externalInviteRepo,
    tournamentInvitations: {
      invite: (...args) => tournamentInvitationsRef.current!.invite(...args),
    },
  });
  const tournamentInvitationService = new TournamentInvitationService({
    invitations: new PrismaTournamentInvitationRepo(db),
    teams: teamRepo,
    users: usersRepo,
    tournaments: organizerTournamentRepo,
    registrations: registrationService,
    notifications: notificationService,
    authz,
    parents: parentService,
  });
  tournamentInvitationsRef.current = tournamentInvitationService;
  const externalInviteService = new ExternalInviteService({
    invites: externalInviteRepo,
    tournaments: organizerTournamentRepo,
    users: usersRepo,
    authz,
    tournamentInvitations: tournamentInvitationService,
    notifications: notificationService,
    email,
    tokens: tokenService,
    audit,
    config: { webOrigin: env.WEB_ORIGIN },
  });
  const groundRepo = new PrismaGroundRepo(db);
  const bookingRepo = new PrismaBookingRepo(db);
  const groundService = new GroundService({
    grounds: groundRepo,
    users: usersRepo,
    authz,
    audit,
    tx,
  });
  const bookingService = new BookingService({
    bookings: bookingRepo,
    grounds: groundRepo,
    fixtures: fixtureRepo,
    notifications: notificationService,
    authz,
    audit,
    tx,
  });
  const umpireAssignmentRepo = new PrismaUmpireAssignmentRepo(db);
  const fixtureService = new FixtureService({
    fixtures: fixtureRepo,
    bookings: bookingRepo,
    grounds: groundRepo,
    umpires: umpireAssignmentRepo,
    users: usersRepo,
    tournaments: organizerTournamentRepo,
    teams: teamRepo,
    notifications: notificationService,
    authz,
    audit,
    tx,
  });
  const umpireService = new UmpireService({
    fixtures: fixtureRepo,
    assignments: umpireAssignmentRepo,
    tournaments: organizerTournamentRepo,
    users: usersRepo,
    notifications: notificationService,
    authz,
    audit,
    tx,
  });
  const resultService = new ResultService({
    results: resultRepo,
    tournaments: organizerTournamentRepo,
    teams: teamRepo,
    notifications: notificationService,
    authz,
    audit,
    tx,
  });
  const playerProfileService = new PlayerProfileService({
    players: new PrismaPlayerProfileRepo(db),
    storage,
  });
  playerProfileServiceRef.current = playerProfileService;

  const limiters = rlConfig
    ? {
        signup: makeAuthRateLimiter(rlConfig, rateLimitStoreFactory('signup')),
        forgotPassword: makeAuthRateLimiter(rlConfig, rateLimitStoreFactory('forgot-password')),
        resendVerification: makeAuthRateLimiter(
          rlConfig,
          rateLimitStoreFactory('resend-verification'),
        ),
      }
    : {};

  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(requestLogger);
  app.use(helmet());
  const corsEnabled = deps.cors ?? !process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (corsEnabled) {
    app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  }
  app.use('/api/me/photo', express.json({ limit: '4mb' }));
  app.use('/api/parent/children/:childId/photo', express.json({ limit: '4mb' }));
  app.use('/api/tournaments/:id/rules-document', express.json({ limit: '15mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = Router();

  api.get('/health', async (_req, res) => {
    let db: { status: 'up'; latencyMs: number } | { status: 'down' } | { status: 'not_configured' };
    if (deps.dbPing) {
      try {
        db = { status: 'up', latencyMs: await deps.dbPing() };
      } catch {
        db = { status: 'down' };
      }
    } else {
      db = { status: 'not_configured' };
    }
    res.json({ ok: db.status !== 'down', uptimeSec: Math.round(process.uptime()), db });
  });

  api.use('/auth', buildAuthRoutes(authService, limiters));
  api.use('/', buildUserRoutes(usersService, authService, requireAuth));
  if (storage instanceof LocalDiskStorageAdapter) {
    api.use('/files', buildFileRoutes(storage));
  }
  api.use('/public', buildPublicTournamentRoutes(publicTournaments, optionalAuth));
  api.use('/public', buildPublicPlayerRoutes(playerProfileService));
  api.use('/', buildPlayerSearchRoutes(usersRepo, requireAuth));
  api.use('/notifications', buildNotificationRoutes(notificationService, requireAuth));
  api.use('/admin', buildAdminUserRoutes(usersService, requireAuth));
  api.use('/admin', buildAdminRoleRequestRoutes(roleRequestService, requireAuth));
  api.use('/', buildRoleRequestRoutes(roleRequestService, requireAuth));
  api.use('/contact', buildContactRoutes(contactService, requireAuth));
  api.use('/admin', buildAdminContactRoutes(contactService, requireAuth));
  api.use('/admin', buildAnnouncementRoutes(announcementService, requireAuth));
  api.use('/admin', buildAdminAuditRoutes(auditQuery, requireAuth));
  api.use('/age-groups', buildAgeGroupRoutes(ageGroupService, requireAuth));
  api.use('/surface-types', buildSurfaceTypeRoutes(surfaceTypeService, requireAuth));
  api.use('/tournaments', buildOrganizerTournamentRoutes(organizerTournamentService, requireAuth));
  api.use('/teams', buildTeamRoutes(teamService, requireAuth));
  api.use('/tournaments', buildDraftTeamRoutes(teamService, requireAuth));
  api.use('/tournaments', buildTournamentRegistrationRoutes(registrationService, requireAuth));
  api.use('/registrations', buildRegistrationWithdrawRoutes(registrationService, requireAuth));
  api.use(
    '/tournaments',
    buildTournamentInvitationRoutes(tournamentInvitationService, requireAuth),
  );
  api.use('/teams', buildTeamInvitationRoutes(tournamentInvitationService, requireAuth));
  api.use(
    '/team-invitations',
    buildTeamInvitationResponseRoutes(tournamentInvitationService, requireAuth),
  );
  api.use(
    '/player-invitations',
    buildPlayerInvitationResponseRoutes(tournamentInvitationService, requireAuth),
  );
  api.use('/tournaments', buildExternalInviteOrganizerRoutes(externalInviteService, requireAuth));
  api.use('/external-invites', buildExternalInviteRoutes(externalInviteService));
  api.use('/grounds', buildGroundRoutes(groundService, bookingService, requireAuth));
  api.use('/bookings', buildBookingRoutes(bookingService, requireAuth));
  api.use('/tournaments', buildTournamentFixtureRoutes(fixtureService, requireAuth));
  api.use('/fixtures', buildFixtureRoutes(fixtureService, umpireService, requireAuth));
  api.use('/fixtures', buildResultRoutes(resultService, requireAuth));
  api.use('/umpire', buildUmpireRoutes(umpireService, requireAuth));
  api.use(
    '/parent',
    buildParentRoutes(
      parentService,
      registrationService,
      teamService,
      tournamentInvitationService,
      requireAuth,
    ),
  );
  api.use('/admin', buildAdminChildRoutes(parentService, authService, requireAuth));

  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
