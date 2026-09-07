import type {
  PublicTournamentDetailDto,
  PublicTournamentSummaryDto,
  TournamentAgeGroupDto,
} from '@nforce/shared';
import { NotFoundError } from '../../lib/errors';
import {
  RULES_DOCUMENT_URL_TTL_SECONDS,
  type StorageAdapter,
} from '../../adapters/storage/StorageAdapter';
import type {
  PublicAgeGroupRow,
  TournamentDetailRow,
  TournamentRepoPort,
  TournamentSummaryRow,
} from './tournament.repo';

function toMonthString(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 7) : null;
}

function toAgeGroupDto(g: PublicAgeGroupRow): TournamentAgeGroupDto {
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

export class PublicTournamentService {
  constructor(
    private readonly tournaments: TournamentRepoPort,
    private readonly storage: Pick<StorageAdapter, 'signedUrl'>,
  ) {}

  private async toSummaryDto(row: TournamentSummaryRow): Promise<PublicTournamentSummaryDto> {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      structure: row.structure,
      teamSelectionMode: row.teamSelectionMode,
      ageGroups: row.ageGroups.map(toAgeGroupDto),
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      rules: row.rules,
      rulesDocumentUrl: row.rulesDocumentKey
        ? await this.storage.signedUrl(row.rulesDocumentKey, RULES_DOCUMENT_URL_TTL_SECONDS)
        : null,
      prizePoolAmount: row.prizePoolAmount,
      prizePoolDescription: row.prizePoolDescription,
      locationCity: row.locationCity,
      locationState: row.locationState,
      surfaceTypeName: row.surfaceTypeName,
      maxMarqueePlayers: row.maxMarqueePlayers,
      capacity: row.capacity,
      registeredCount: row.registeredCount,
      status: row.status,
      organizerName: row.organizerName,
      organizerAcademyName: row.organizerAcademyName,
      teamsCount: row.teamsCount,
      fixtureDates: row.fixtureDates,
    };
  }

  async list(): Promise<PublicTournamentSummaryDto[]> {
    const rows = await this.tournaments.listSummaries(['published', 'closed']);
    return Promise.all(rows.map((r) => this.toSummaryDto(r)));
  }

  async detail(id: string, viewerId?: string): Promise<PublicTournamentDetailDto> {
    const row = await this.tournaments.findDetail(id);
    if (!row) throw new NotFoundError('Tournament not found');
    const isOwnPreview = viewerId != null && viewerId === row.organizerId;
    if (row.status === 'draft' && !isOwnPreview) {
      throw new NotFoundError('Tournament not found');
    }
    return {
      ...(await this.toSummaryDto(row)),
      fixtures: (row as TournamentDetailRow).fixtures.map((f) => ({
        id: f.id,
        homeTeam: f.homeTeamName,
        awayTeam: f.awayTeamName,
        ground: f.groundName,
        startsAt: f.startsAt.toISOString(),
        durationMinutes: f.durationMinutes,
        result: f.result
          ? {
              homeScore: f.result.homeScore,
              awayScore: f.result.awayScore,
              winnerTeam: f.result.winnerTeamName,
              homeRunsTotal: f.result.homeRunsTotal,
              awayRunsTotal: f.result.awayRunsTotal,
              homePlayerScores: f.result.homePlayerScores,
              awayPlayerScores: f.result.awayPlayerScores,
            }
          : null,
      })),
      standings: row.standings.map((s) => ({
        team: s.teamName,
        played: s.played,
        won: s.won,
        lost: s.lost,
        drawn: s.drawn,
        points: s.points,
      })),
    };
  }
}
