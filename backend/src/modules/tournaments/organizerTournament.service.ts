import type {
  CreateTournamentInput,
  OrganizerTournamentDto,
  TournamentAgeGroupDto,
  TournamentNotifyAudience,
  UpdateTournamentInput,
  UploadRulesDocumentInput,
} from '@nforce/shared';
import { MAX_RULES_DOCUMENT_BYTES } from '@nforce/shared';
import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';
import type { TxRunner } from '../../lib/db';
import {
  RULES_DOCUMENT_URL_TTL_SECONDS,
  type StorageAdapter,
} from '../../adapters/storage/StorageAdapter';
import type { AuditPort } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';
import type { RegistrationRepoPort } from '../registrations/registration.repo';
import type { TeamRepoPort } from '../teams/team.repo';
import type { AuthzService } from '../users-auth/authz.service';
import type { UserRepoPort } from '../users-auth/user.repo';
import type {
  OrganizerTournamentAgeGroupRow,
  OrganizerTournamentRepoPort,
  OrganizerTournamentRow,
  TournamentAgeGroupWrite,
  TournamentCreateWrite,
  TournamentUpdateWrite,
} from './organizerTournament.repo';

function toMonthString(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 7) : null;
}

function toAgeGroupDto(g: OrganizerTournamentAgeGroupRow): TournamentAgeGroupDto {
  return {
    id: g.id,
    ageGroupId: g.ageGroupId,
    name: g.name,
    bornAfter: toMonthString(g.bornAfter),
    bornBefore: toMonthString(g.bornBefore),
    genderCategory: g.genderCategory,
    registrationStartDate: g.registrationStartDate.toISOString(),
    registrationEndDate: g.registrationEndDate.toISOString(),
    capacity: g.capacity,
    registeredCount: g.registeredCount,
    format: g.format,
    entryFee: g.entryFee,
    oversPerInnings: g.oversPerInnings,
  };
}

function toAgeGroupWrite(
  input: CreateTournamentInput['ageGroups'][number],
): TournamentAgeGroupWrite {
  return {
    ageGroupId: input.ageGroupId,
    bornAfter: input.bornAfter ? new Date(`${input.bornAfter}-01`) : null,
    bornBefore: input.bornBefore ? new Date(`${input.bornBefore}-01`) : null,
    genderCategory: input.genderCategory,
    registrationStartDate: new Date(input.registrationStartDate),
    registrationEndDate: new Date(input.registrationEndDate),
    capacity: input.capacity ?? null,
    format: input.format,
    entryFee: input.entryFee ?? null,
    oversPerInnings: input.oversPerInnings ?? null,
  };
}

export interface OrganizerTournamentServiceDeps {
  tournaments: OrganizerTournamentRepoPort;
  authz: AuthzService;
  audit: AuditPort;
  tx: TxRunner;
  notifications: NotificationService;
  users: Pick<
    UserRepoPort,
    'listIds' | 'findById' | 'listIdsByRoleAndState' | 'listIdsSubscribedToPublishState'
  >;
  storage: Pick<StorageAdapter, 'put' | 'signedUrl' | 'delete'>;
  registrations: Pick<
    RegistrationRepoPort,
    'listForTournament' | 'listUserAndManagerIdsRegisteredInYear'
  >;
  teams: Pick<TeamRepoPort, 'findById'>;
}

export class OrganizerTournamentService {
  constructor(private readonly deps: OrganizerTournamentServiceDeps) {}

  private async assertOwnerOrAdmin(
    actorId: string,
    tournament: OrganizerTournamentRow,
  ): Promise<void> {
    if (tournament.organizerId === actorId) return;
    const roles = await this.deps.authz.getRoles(actorId);
    if (!roles.includes('platform_admin')) {
      throw new ForbiddenError('You are not allowed to manage this tournament', 'NOT_ALLOWED');
    }
  }

  private async getOr404(id: string): Promise<OrganizerTournamentRow> {
    const row = await this.deps.tournaments.findById(id);
    if (!row) throw new NotFoundError('Tournament not found');
    return row;
  }

  private async toDto(row: OrganizerTournamentRow): Promise<OrganizerTournamentDto> {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      structure: row.structure,
      teamSelectionMode: row.teamSelectionMode,
      ageGroups: row.ageGroups.map(toAgeGroupDto),
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      capacity: row.capacity,
      registeredCount: row.registeredCount,
      rules: row.rules,
      rulesDocumentUrl: row.rulesDocumentKey
        ? await this.deps.storage.signedUrl(row.rulesDocumentKey, RULES_DOCUMENT_URL_TTL_SECONDS)
        : null,
      prizePoolAmount: row.prizePoolAmount,
      prizePoolDescription: row.prizePoolDescription,
      locationCity: row.locationCity,
      locationState: row.locationState,
      surfaceTypeId: row.surfaceTypeId,
      maxMarqueePlayers: row.maxMarqueePlayers,
      notifyOnPublish: row.notifyOnPublish,
      notifyAudiences: row.notifyAudiences,
      notifyState: row.notifyState,
      status: row.status,
      organizerId: row.organizerId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async create(
    actorId: string,
    input: CreateTournamentInput,
    ip?: string,
  ): Promise<OrganizerTournamentDto> {
    await this.deps.authz.assertRole(actorId, 'organizer');
    const write: TournamentCreateWrite = {
      name: input.name,
      description: input.description ?? null,
      structure: input.structure,
      teamSelectionMode: input.teamSelectionMode,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      capacity: input.capacity ?? null,
      rules: input.rules ?? null,
      rulesDocumentKey: null,
      prizePoolAmount: input.prizePoolAmount ?? null,
      prizePoolDescription: input.prizePoolDescription ?? null,
      locationCity: input.locationCity ?? null,
      locationState: input.locationState ?? null,
      surfaceTypeId: input.surfaceTypeId ?? null,
      maxMarqueePlayers: input.maxMarqueePlayers ?? null,
      notifyOnPublish: input.notifyOnPublish,
      notifyAudiences: input.notifyAudiences,
      notifyState: input.notifyState ?? null,
      ageGroups: input.ageGroups.map(toAgeGroupWrite),
    };
    const row = await this.deps.tx.run(async (db) => {
      const created = await this.deps.tournaments.create(actorId, write, db);
      await this.deps.audit.write(
        {
          action: 'tournament.created',
          actorUserId: actorId,
          entityType: 'tournament',
          entityId: created.id,
          meta: { name: created.name, ageGroupCount: created.ageGroups.length },
          ip,
        },
        db,
      );
      return created;
    });
    return this.toDto(row);
  }

  async listMine(actorId: string): Promise<OrganizerTournamentDto[]> {
    await this.deps.authz.assertRole(actorId, 'organizer');
    const rows = await this.deps.tournaments.listByOrganizer(actorId);
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  async getOwned(actorId: string, id: string): Promise<OrganizerTournamentDto> {
    const row = await this.getOr404(id);
    await this.assertOwnerOrAdmin(actorId, row);
    return this.toDto(row);
  }

  async update(
    actorId: string,
    id: string,
    input: UpdateTournamentInput,
    ip?: string,
  ): Promise<OrganizerTournamentDto> {
    const existing = await this.getOr404(id);
    await this.assertOwnerOrAdmin(actorId, existing);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only a draft tournament can be edited', 'INVALID_STATUS');
    }
    const effectiveEndDate = input.endDate ? new Date(input.endDate) : existing.endDate;
    const effectiveAgeGroups = input.ageGroups ?? existing.ageGroups;
    if (effectiveAgeGroups.some((g) => new Date(g.registrationEndDate) > effectiveEndDate)) {
      throw new ConflictError(
        'Registration end date must not be after the tournament end date',
        'REGISTRATION_AFTER_END',
      );
    }
    const write: TournamentUpdateWrite = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.structure !== undefined ? { structure: input.structure } : {}),
      ...(input.teamSelectionMode !== undefined
        ? { teamSelectionMode: input.teamSelectionMode }
        : {}),
      ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
      ...(input.endDate !== undefined ? { endDate: new Date(input.endDate) } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity ?? null } : {}),
      ...(input.rules !== undefined ? { rules: input.rules ?? null } : {}),
      ...(input.prizePoolAmount !== undefined
        ? { prizePoolAmount: input.prizePoolAmount ?? null }
        : {}),
      ...(input.prizePoolDescription !== undefined
        ? { prizePoolDescription: input.prizePoolDescription ?? null }
        : {}),
      ...(input.locationCity !== undefined ? { locationCity: input.locationCity ?? null } : {}),
      ...(input.locationState !== undefined ? { locationState: input.locationState ?? null } : {}),
      ...(input.surfaceTypeId !== undefined ? { surfaceTypeId: input.surfaceTypeId ?? null } : {}),
      ...(input.maxMarqueePlayers !== undefined
        ? { maxMarqueePlayers: input.maxMarqueePlayers ?? null }
        : {}),
      ...(input.notifyOnPublish !== undefined ? { notifyOnPublish: input.notifyOnPublish } : {}),
      ...(input.notifyAudiences !== undefined ? { notifyAudiences: input.notifyAudiences } : {}),
      ...(input.notifyState !== undefined ? { notifyState: input.notifyState ?? null } : {}),
      ...(input.ageGroups !== undefined ? { ageGroups: input.ageGroups.map(toAgeGroupWrite) } : {}),
    };
    const row = await this.deps.tx.run(async (db) => {
      const updated = await this.deps.tournaments.update(id, write, db);
      await this.deps.audit.write(
        {
          action: 'tournament.updated',
          actorUserId: actorId,
          entityType: 'tournament',
          entityId: updated.id,
          meta: { name: updated.name, changedFields: Object.keys(write) },
          ip,
        },
        db,
      );
      return updated;
    });
    return this.toDto(row);
  }

  async publish(actorId: string, id: string, ip?: string): Promise<OrganizerTournamentDto> {
    const existing = await this.getOr404(id);
    await this.assertOwnerOrAdmin(actorId, existing);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only a draft tournament can be published', 'INVALID_STATUS');
    }

    const row = await this.deps.tx.run(async (db) => {
      let updated = await this.deps.tournaments.updateStatus(id, 'published', db);
      if (existing.notifyOnPublish) {
        updated = await this.deps.tournaments.markNotified(id, db);
      }
      await this.deps.audit.write(
        {
          action: 'tournament.published',
          actorUserId: actorId,
          entityType: 'tournament',
          entityId: id,
          meta: { notifyOnPublish: existing.notifyOnPublish },
          ip,
        },
        db,
      );
      return updated;
    });

    await this.notifyPlatformOnPublish(row, existing.notifyOnPublish);
    return this.toDto(row);
  }

  private async notifyPlatformOnPublish(
    tournament: OrganizerTournamentRow,
    notifyOnPublish: boolean,
  ): Promise<void> {
    const includeManagers = tournament.teamSelectionMode !== 'draft_based';
    const state = tournament.locationState;
    const [broadcastIds, subscriberPlayerIds, subscriberManagerIds] = await Promise.all([
      notifyOnPublish ? this.resolveNotifyAudience(tournament, includeManagers) : [],
      state ? this.deps.users.listIdsSubscribedToPublishState('player', state) : [],
      state && includeManagers
        ? this.deps.users.listIdsSubscribedToPublishState('team_manager', state)
        : [],
    ]);
    const subscriberIds = [...subscriberPlayerIds, ...subscriberManagerIds];
    const recipientIds = [...new Set([...broadcastIds, ...subscriberIds])];
    if (recipientIds.length === 0) return;
    await this.deps.notifications.notifyMany(recipientIds, {
      type: 'tournament_published',
      title: `New tournament: ${tournament.name}`,
      body: `${tournament.name} is now open for registration.`,
      payload: { tournamentId: tournament.id },
    });
  }

  private async resolveOneAudience(
    audience: TournamentNotifyAudience,
    notifyState: string | null,
    includeManagers: boolean,
  ): Promise<string[]> {
    switch (audience) {
      case 'last_year_players': {
        const lastYear = new Date().getUTCFullYear() - 1;
        const { userIds } =
          await this.deps.registrations.listUserAndManagerIdsRegisteredInYear(lastYear);
        return userIds;
      }
      case 'last_year_managers': {
        if (!includeManagers) return [];
        const lastYear = new Date().getUTCFullYear() - 1;
        const { managerIds } =
          await this.deps.registrations.listUserAndManagerIdsRegisteredInYear(lastYear);
        return managerIds;
      }
      case 'state': {
        const state = notifyState!;
        const [playerIds, managerIds] = await Promise.all([
          this.deps.users.listIdsByRoleAndState('player', state),
          includeManagers
            ? this.deps.users.listIdsByRoleAndState('team_manager', state)
            : Promise.resolve([]),
        ]);
        return [...playerIds, ...managerIds];
      }
      case 'everyone':
      default: {
        const [playerIds, managerIds] = await Promise.all([
          this.deps.users.listIds('player'),
          includeManagers ? this.deps.users.listIds('team_manager') : Promise.resolve([]),
        ]);
        return [...playerIds, ...managerIds];
      }
    }
  }

  private async resolveNotifyAudience(
    tournament: OrganizerTournamentRow,
    includeManagers: boolean,
  ): Promise<string[]> {
    const perAudience = await Promise.all(
      tournament.notifyAudiences.map((a) =>
        this.resolveOneAudience(a, tournament.notifyState, includeManagers),
      ),
    );
    return [...new Set(perAudience.flat())];
  }

  async close(actorId: string, id: string, ip?: string): Promise<OrganizerTournamentDto> {
    const existing = await this.getOr404(id);
    await this.assertOwnerOrAdmin(actorId, existing);
    if (existing.status !== 'published') {
      throw new ConflictError('Only a published tournament can be closed', 'INVALID_STATUS');
    }
    const row = await this.deps.tx.run(async (db) => {
      const updated = await this.deps.tournaments.updateStatus(id, 'closed', db);
      await this.deps.audit.write(
        {
          action: 'tournament.closed',
          actorUserId: actorId,
          entityType: 'tournament',
          entityId: updated.id,
          ip,
        },
        db,
      );
      return updated;
    });
    return this.toDto(row);
  }

  async uploadRulesDocument(
    actorId: string,
    id: string,
    input: UploadRulesDocumentInput,
  ): Promise<OrganizerTournamentDto> {
    const existing = await this.getOr404(id);
    await this.assertOwnerOrAdmin(actorId, existing);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only a draft tournament can be edited', 'INVALID_STATUS');
    }

    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.data, 'base64');
    } catch {
      throw new ValidationError(undefined, 'Document data is not valid base64');
    }
    if (bytes.length === 0) throw new ValidationError(undefined, 'Document data is empty');
    if (bytes.length > MAX_RULES_DOCUMENT_BYTES) {
      throw new ValidationError(
        undefined,
        `Rules document must be ${Math.floor(MAX_RULES_DOCUMENT_BYTES / (1024 * 1024))} MB or smaller`,
      );
    }

    const ext = input.contentType === 'application/pdf' ? 'pdf' : 'txt';
    const key = `tournament-${id}-rules-${randomUUID()}.${ext}`;
    await this.deps.storage.put(key, bytes, input.contentType);

    const oldKey = existing.rulesDocumentKey;
    const row = await this.deps.tournaments.setRulesDocumentKey(id, key);
    if (oldKey && oldKey !== key) {
      await this.deps.storage.delete(oldKey);
    }
    return this.toDto(row);
  }

  async deleteRulesDocument(
    actorId: string,
    id: string,
    ip?: string,
  ): Promise<OrganizerTournamentDto> {
    const existing = await this.getOr404(id);
    await this.assertOwnerOrAdmin(actorId, existing);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only a draft tournament can be edited', 'INVALID_STATUS');
    }
    const row = await this.deps.tournaments.setRulesDocumentKey(id, null);
    if (existing.rulesDocumentKey) {
      await this.deps.storage.delete(existing.rulesDocumentKey);
    }
    await this.deps.audit.write({
      action: 'tournament.rules_document_deleted',
      actorUserId: actorId,
      entityType: 'tournament',
      entityId: id,
      meta: { name: existing.name },
      ip,
    });
    return this.toDto(row);
  }

  async delete(actorId: string, id: string, ip?: string): Promise<void> {
    const existing = await this.getOr404(id);
    await this.assertOwnerOrAdmin(actorId, existing);
    const activeRegs = (await this.deps.registrations.listForTournament(id)).filter(
      (r) => r.status === 'active',
    );

    await this.deps.tx.run(async (db) => {
      await this.deps.tournaments.delete(id, db);
      await this.deps.audit.write(
        {
          action: 'tournament.deleted',
          actorUserId: actorId,
          entityType: 'tournament',
          entityId: id,
          meta: { name: existing.name },
          ip,
        },
        db,
      );
    });

    const notifyIds = new Set<string>();
    for (const reg of activeRegs) {
      if (reg.teamId) {
        const team = await this.deps.teams.findById(reg.teamId);
        if (team) notifyIds.add(team.managerId);
      } else if (reg.userId) {
        const user = await this.deps.users.findById(reg.userId);
        notifyIds.add(user?.managedByParentId ?? reg.userId);
      }
    }
    for (const userId of notifyIds) {
      await this.deps.notifications.notify({
        userId,
        type: 'tournament_deleted',
        title: `Tournament removed: ${existing.name}`,
        body: `${existing.name} has been removed by its organizer. Your registration no longer applies.`,
        payload: {},
      });
    }
  }
}
