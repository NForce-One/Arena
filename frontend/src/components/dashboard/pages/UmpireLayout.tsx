import type { OpenFixtureDto, UmpireScheduleEntryDto } from '@nforce/shared';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router';
import { api } from '../../../lib/apiClient';
import { formatSlot } from '../../../lib/calendar';
import { errorsFrom } from '../../../lib/forms';
import { Icon } from '../ui/Icon';
import { PageTabs, type PageTabItem } from '../ui/PageTabs';
import { TeamMonogram } from '../ui/TeamMonogram';
import styles from './UmpirePage.module.css';

export interface UmpireOutletContext {
  open: OpenFixtureDto[] | null;
  schedule: UmpireScheduleEntryDto[] | null;
  error: string | null;
  busyIds: Set<string>;
  apply: (fixtureId: string) => Promise<void>;
  respond: (fixtureId: string, decision: 'accept' | 'decline') => Promise<void>;
}

export function statusLabel(status: NonNullable<OpenFixtureDto['myStatus']>): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function matchesQuery(q: string, ...parts: (string | null | undefined)[]): boolean {
  if (!q) return true;
  return parts.some((p) => (p ?? '').toLowerCase().includes(q));
}

interface MatchRowProps {
  id: string;
  homeTeam: string;
  awayTeam: string;
  tournamentName: string;
  ground: string | null;
  startsAt: string;
  index: number;
  action?: ReactNode;
}

export function MatchRow({
  homeTeam,
  awayTeam,
  tournamentName,
  ground,
  startsAt,
  index,
  action,
}: MatchRowProps) {
  const stagger: CSSProperties = { animationDelay: `${60 + index * 40}ms` };
  return (
    <div className={styles.row} style={stagger}>
      <div className={styles.teams}>
        <div className={styles.team}>
          <TeamMonogram name={homeTeam} size="md" />
          <span className={styles.teamName} title={homeTeam}>
            {homeTeam}
          </span>
        </div>
        <span className={styles.vs} aria-hidden="true">
          vs
        </span>
        <div className={styles.team}>
          <TeamMonogram name={awayTeam} size="md" />
          <span className={styles.teamName} title={awayTeam}>
            {awayTeam}
          </span>
        </div>
      </div>
      <div className={styles.meta}>
        <span className={styles.tourn}>{tournamentName}</span>
        <span className={styles.sep} aria-hidden="true">
          ·
        </span>
        <span className={styles.when}>{formatSlot(startsAt)}</span>
        {ground && (
          <>
            <span className={styles.sep} aria-hidden="true">
              ·
            </span>
            <span className={styles.ground}>{ground}</span>
          </>
        )}
      </div>
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </div>
  );
}

export function DashboardUmpireLayout() {
  const [open, setOpen] = useState<OpenFixtureDto[] | null>(null);
  const [schedule, setSchedule] = useState<UmpireScheduleEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([
        api<{ fixtures: OpenFixtureDto[] }>('/api/umpire/open-fixtures'),
        api<{ schedule: UmpireScheduleEntryDto[] }>('/api/umpire/schedule'),
      ]);
      setOpen(o.fixtures);
      setSchedule(s.schedule);
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function apply(fixtureId: string) {
    setError(null);
    setBusy(fixtureId, true);
    try {
      await api(`/api/umpire/fixtures/${fixtureId}/apply`, { body: {} });
      await load();
    } catch (err) {
      setError(errorsFrom(err).banner);
    } finally {
      setBusy(fixtureId, false);
    }
  }

  async function respond(fixtureId: string, decision: 'accept' | 'decline') {
    setError(null);
    setBusy(fixtureId, true);
    try {
      await api(`/api/umpire/fixtures/${fixtureId}/respond`, { body: { decision } });
      await load();
    } catch (err) {
      setError(errorsFrom(err).banner);
    } finally {
      setBusy(fixtureId, false);
    }
  }

  const invitesCount = useMemo(
    () => (open ?? []).filter((f) => f.myStatus === 'invited').length,
    [open],
  );

  const tabs: PageTabItem[] = [
    { to: '/umpire', label: 'My Schedule', end: true },
    { to: '/umpire/invites', label: 'Invites', count: invitesCount },
    { to: '/umpire/open-matches', label: 'Open Matches' },
    { to: '/umpire/applications', label: 'My Applications' },
  ];

  const context: UmpireOutletContext = { open, schedule, error, busyIds, apply, respond };

  return (
    <div className={styles.page}>
      <PageTabs items={tabs} />

      {error && (
        <div className={styles.errorBanner} role="alert">
          <Icon name="x" size={16} />
          <span>{error}</span>
        </div>
      )}

      <Outlet context={context} />
    </div>
  );
}
