import type { PrismaClient } from '@prisma/client';

export interface AuditRow {
  id: string;
  action: string;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  meta: unknown;
  metaLabels: Record<string, string>;
  ip: string | null;
  createdAt: Date;
}

const ID_META_KEYS: Record<string, 'tournament' | 'team' | 'user' | 'fixture'> = {
  tournamentId: 'tournament',
  teamId: 'team',
  winnerTeamId: 'team',
  previousWinnerTeamId: 'team',
  umpireId: 'user',
  targetUserId: 'user',
  fixtureId: 'fixture',
};

export interface AuditReadPort {
  listRecent(limit?: number): Promise<AuditRow[]>;
}

export class PrismaAuditRepo implements AuditReadPort {
  constructor(private readonly client: PrismaClient) {}

  async listRecent(limit = 100): Promise<AuditRow[]> {
    const rows = await this.client.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { name: true } } },
    });

    const wanted = { tournament: new Set<string>(), team: new Set<string>(), user: new Set<string>(), fixture: new Set<string>(), ground: new Set<string>(), age_group: new Set<string>(), announcement: new Set<string>() };
    const metaOf = (r: (typeof rows)[number]): Record<string, unknown> =>
      r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta)
        ? (r.meta as Record<string, unknown>)
        : {};

    for (const r of rows) {
      if (r.entityId && r.entityType && r.entityType in wanted) {
        wanted[r.entityType as keyof typeof wanted].add(r.entityId);
      }
      for (const [key, kind] of Object.entries(ID_META_KEYS)) {
        const v = metaOf(r)[key];
        if (typeof v === 'string' && v) wanted[kind].add(v);
      }
    }

    const ids = (s: Set<string>) => [...s];
    const [tournaments, teams, users, fixtures, grounds, ageGroups] = await Promise.all([
      wanted.tournament.size
        ? this.client.tournament.findMany({
            where: { id: { in: ids(wanted.tournament) } },
            select: { id: true, name: true },
          })
        : [],
      wanted.team.size
        ? this.client.team.findMany({
            where: { id: { in: ids(wanted.team) } },
            select: { id: true, name: true },
          })
        : [],
      wanted.user.size
        ? this.client.user.findMany({
            where: { id: { in: ids(wanted.user) } },
            select: { id: true, name: true },
          })
        : [],
      wanted.fixture.size
        ? this.client.fixture.findMany({
            where: { id: { in: ids(wanted.fixture) } },
            select: {
              id: true,
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
            },
          })
        : [],
      wanted.ground.size
        ? this.client.ground.findMany({
            where: { id: { in: ids(wanted.ground) } },
            select: { id: true, name: true },
          })
        : [],
      wanted.age_group.size
        ? this.client.ageGroup.findMany({
            where: { id: { in: ids(wanted.age_group) } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const names = new Map<string, string>();
    for (const t of tournaments) names.set(t.id, t.name);
    for (const t of teams) names.set(t.id, t.name);
    for (const u of users) names.set(u.id, u.name);
    for (const g of grounds) names.set(g.id, g.name);
    for (const a of ageGroups) names.set(a.id, a.name);
    for (const f of fixtures) names.set(f.id, `${f.homeTeam.name} v ${f.awayTeam.name}`);

    return rows.map((r) => {
      const meta = metaOf(r);
      const metaLabels: Record<string, string> = {};
      for (const key of Object.keys(ID_META_KEYS)) {
        const v = meta[key];
        const name = typeof v === 'string' ? names.get(v) : undefined;
        if (name) metaLabels[key] = name;
      }
      return {
        id: r.id,
        action: r.action,
        actorName: r.actor?.name ?? null,
        entityType: r.entityType,
        entityId: r.entityId,
        entityLabel: (r.entityId && names.get(r.entityId)) || null,
        meta: r.meta,
        metaLabels,
        ip: r.ip,
        createdAt: r.createdAt,
      };
    });
  }
}
