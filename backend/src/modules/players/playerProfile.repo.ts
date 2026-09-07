import type {
  BattingStyle,
  BowlingStyle,
  Gender,
  HeightUnit,
  JerseySize,
  PlayingRole,
  PrismaClient,
  TeamRole,
  WeightUnit,
} from '@prisma/client';

export interface PlayerTeamTournament {
  tournamentId: string;
  tournamentName: string;
  teamId: string;
  teamName: string;
  roleInTeam: TeamRole;
  joinedAt: Date;
}

export interface TeamOutcome {
  homeTeamId: string;
  awayTeamId: string;
  winnerTeamId: string | null;
  startsAt: Date;
}

export interface PublicPlayerRow {
  id: string;
  name: string;
  photoKey: string | null;
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
  consentAcceptedAt: Date | null;
}

export interface PlayerProfileRepoPort {
  findUser(userId: string): Promise<PublicPlayerRow | null>;
  teamTournaments(userId: string): Promise<PlayerTeamTournament[]>;
  teamOutcomes(tournamentId: string, teamId: string): Promise<TeamOutcome[]>;
  runsScored(tournamentId: string, userId: string): Promise<number>;
}

export class PrismaPlayerProfileRepo implements PlayerProfileRepoPort {
  constructor(private readonly client: PrismaClient) {}

  findUser(userId: string): Promise<PublicPlayerRow | null> {
    return this.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        photoKey: true,
        school: true,
        jerseyNumber: true,
        jerseyName: true,
        jerseySize: true,
        battingStyle: true,
        battingStyleOther: true,
        bowlingStyle: true,
        bowlingStyleOther: true,
        playingRole: true,
        heightValue: true,
        heightUnit: true,
        weightValue: true,
        weightUnit: true,
        gender: true,
        consentAcceptedAt: true,
      },
    });
  }

  async teamTournaments(userId: string): Promise<PlayerTeamTournament[]> {
    const rosterEntries = await this.client.teamRosterEntry.findMany({
      where: { userId, status: 'accepted' },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            registrations: {
              where: { status: 'active', tournament: { status: { in: ['published', 'closed'] } } },
              select: { tournament: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    const out: PlayerTeamTournament[] = [];
    for (const entry of rosterEntries) {
      for (const reg of entry.team.registrations) {
        out.push({
          tournamentId: reg.tournament.id,
          tournamentName: reg.tournament.name,
          teamId: entry.team.id,
          teamName: entry.team.name,
          roleInTeam: entry.roleInTeam,
          joinedAt: entry.joinedAt,
        });
      }
    }
    return out;
  }

  async teamOutcomes(tournamentId: string, teamId: string): Promise<TeamOutcome[]> {
    const results = await this.client.result.findMany({
      where: {
        fixture: {
          tournamentId,
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        },
      },
      select: {
        winnerTeamId: true,
        fixture: { select: { homeTeamId: true, awayTeamId: true, startsAt: true } },
      },
    });
    return results.map((r) => ({
      homeTeamId: r.fixture.homeTeamId,
      awayTeamId: r.fixture.awayTeamId,
      winnerTeamId: r.winnerTeamId,
      startsAt: r.fixture.startsAt,
    }));
  }

  async runsScored(tournamentId: string, userId: string): Promise<number> {
    const agg = await this.client.playerInningsScore.aggregate({
      where: { userId, result: { fixture: { tournamentId } } },
      _sum: { runs: true },
    });
    return agg._sum.runs ?? 0;
  }
}
