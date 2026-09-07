import type { PlayerTournamentStatDto, PublicPlayerProfileDto } from '@nforce/shared';
import { PHOTO_URL_TTL_SECONDS, type StorageAdapter } from '../../adapters/storage/StorageAdapter';
import { NotFoundError } from '../../lib/errors';
import type { PlayerProfileRepoPort, TeamOutcome } from './playerProfile.repo';

function record(
  teamId: string,
  outcomes: TeamOutcome[],
  joinedAt: Date,
): { played: number; won: number; lost: number } {
  let played = 0;
  let won = 0;
  let lost = 0;
  for (const o of outcomes) {
    if (o.startsAt < joinedAt) continue;
    played += 1;
    if (o.winnerTeamId === teamId) won += 1;
    else if (o.winnerTeamId !== null) lost += 1;
  }
  return { played, won, lost };
}

export interface PlayerProfileServiceDeps {
  players: PlayerProfileRepoPort;
  storage: StorageAdapter;
}

export class PlayerProfileService {
  constructor(private readonly deps: PlayerProfileServiceDeps) {}

  async getProfile(userId: string): Promise<PublicPlayerProfileDto> {
    const user = await this.deps.players.findUser(userId);
    if (!user) throw new NotFoundError('Player not found');

    const teamTournaments = await this.deps.players.teamTournaments(userId);
    const tournaments: PlayerTournamentStatDto[] = [];
    for (const tt of teamTournaments) {
      const [outcomes, runsScored] = await Promise.all([
        this.deps.players.teamOutcomes(tt.tournamentId, tt.teamId),
        this.deps.players.runsScored(tt.tournamentId, userId),
      ]);
      const rec = record(tt.teamId, outcomes, tt.joinedAt);
      tournaments.push({
        tournamentId: tt.tournamentId,
        tournamentName: tt.tournamentName,
        teamName: tt.teamName,
        roleInTeam: tt.roleInTeam,
        ...rec,
        runsScored,
      });
    }

    return {
      id: user.id,
      name: user.name,
      photoUrl: user.photoKey
        ? await this.deps.storage.signedUrl(user.photoKey, PHOTO_URL_TTL_SECONDS)
        : null,
      tournaments,
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
      consentConfirmed: user.consentAcceptedAt != null,
      consentDate: user.consentAcceptedAt
        ? user.consentAcceptedAt.toISOString().slice(0, 10)
        : null,
    };
  }
}
