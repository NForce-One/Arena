import type { PublicTournamentSummaryDto, TournamentInvitationDto } from '@nforce/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMyTournamentEntries } from '../../../hooks/useMyTournamentEntries';
import { useTournamentsPageTabs } from '../../../hooks/useTournamentsPageTabs';
import { api } from '../../../lib/apiClient';
import { buildMonthGrid, toISODate, todayISODate } from '../../../lib/calendar';
import { errorsFrom } from '../../../lib/forms';
import { deriveTournamentState } from '../../../lib/tournamentState';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import { PageTabs } from '../ui/PageTabs';
import shellStyles from './FixturesPage.module.css';
import styles from './MyTournamentsPage.module.css';

type Category = 'accepted' | 'invited' | 'completed';

const CATEGORY_LABEL: Record<Category, string> = {
  accepted: 'Accepted',
  invited: 'Invited',
  completed: 'Completed',
};

const CATEGORY_DOT_CLASS: Record<Category, string> = {
  accepted: styles.dotAccepted ?? '',
  invited: styles.dotInvited ?? '',
  completed: styles.dotCompleted ?? '',
};

const CATEGORY_BADGE_CLASS: Record<Category, string> = {
  accepted: styles.badgeAccepted ?? '',
  invited: styles.badgeInvited ?? '',
  completed: styles.badgeCompleted ?? '',
};

interface CalendarEntry {
  key: string;
  tournamentId: string;
  tournamentName: string;
  startDate: string;
  endDate: string;
  entityName: string;
  ageGroupLabel: string;
  category: Category;
  locationCity: string | null;
  locationState: string | null;
  invitation?: TournamentInvitationDto;
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRange(startISO: string, endISO: string): string {
  if (startISO === endISO) return formatDay(startISO);
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  const sameMonth =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = sameMonth
    ? end.toLocaleDateString(undefined, { day: 'numeric' })
    : end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${startLabel} – ${endLabel}, ${end.getFullYear()}`;
}

const MAX_DOTS_PER_DAY = 3;

export function DashboardMyTournamentsPage() {
  const pageTabs = useTournamentsPageTabs();

  const { entries, error: entriesError } = useMyTournamentEntries();

  const [invites, setInvites] = useState<TournamentInvitationDto[] | null>(null);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingDecline, setPendingDecline] = useState<TournamentInvitationDto | null>(null);

  const [allTournaments, setAllTournaments] = useState<PublicTournamentSummaryDto[] | null>(null);

  const loadInvites = useCallback(async () => {
    try {
      const { teams } = await api<{ teams: { id: string }[] }>('/api/teams/mine');
      const lists = await Promise.all(
        teams.map((t) =>
          api<{ invitations: TournamentInvitationDto[] }>(
            `/api/teams/${t.id}/tournament-invitations`,
          ).catch(() => ({ invitations: [] })),
        ),
      );
      setInvites(lists.flatMap((l) => l.invitations));
    } catch (err) {
      setInvitesError(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  useEffect(() => {
    void api<{ tournaments: PublicTournamentSummaryDto[] }>('/api/public/tournaments')
      .then((data) => setAllTournaments(data.tournaments))
      .catch(() => setAllTournaments([]));
  }, []);

  async function respond(invitation: TournamentInvitationDto, decision: 'accept' | 'decline') {
    setRespondError(null);
    setBusy(invitation.id);
    try {
      await api(`/api/team-invitations/${invitation.id}/respond`, { body: { decision } });
      await loadInvites();
    } catch (err) {
      setRespondError(errorsFrom(err).banner);
    } finally {
      setBusy(null);
    }
  }

  const allCalendarEntries = useMemo<CalendarEntry[]>(() => {
    const out: CalendarEntry[] = [];
    for (const e of entries ?? []) {
      const state = deriveTournamentState(e.tournament);
      out.push({
        key: `reg-${e.registration.id}`,
        tournamentId: e.tournament.id,
        tournamentName: e.tournament.name,
        startDate: e.tournament.startDate.slice(0, 10),
        endDate: e.tournament.endDate.slice(0, 10),
        entityName: e.registration.entityName,
        ageGroupLabel: e.registration.ageGroupLabel,
        category: state === 'past' || state === 'closed' ? 'completed' : 'accepted',
        locationCity: e.tournament.locationCity,
        locationState: e.tournament.locationState,
      });
    }
    if (allTournaments) {
      const byId = new Map(allTournaments.map((t) => [t.id, t]));
      for (const inv of invites ?? []) {
        const t = byId.get(inv.tournamentId);
        if (!t) continue;
        out.push({
          key: `inv-${inv.id}`,
          tournamentId: inv.tournamentId,
          tournamentName: inv.tournamentName,
          startDate: t.startDate.slice(0, 10),
          endDate: t.endDate.slice(0, 10),
          entityName: inv.entityName,
          ageGroupLabel: inv.ageGroupLabel,
          category: 'invited',
          locationCity: t.locationCity,
          locationState: t.locationState,
          invitation: inv,
        });
      }
    }
    return out;
  }, [entries, invites, allTournaments]);

  const teamNames = useMemo(
    () => Array.from(new Set(allCalendarEntries.map((e) => e.entityName))).sort(),
    [allCalendarEntries],
  );

  const [activeCategories, setActiveCategories] = useState<Set<Category>>(
    () => new Set<Category>(['accepted', 'invited', 'completed']),
  );
  const [teamFilter, setTeamFilter] = useState('all');

  function toggleCategory(cat: Category) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  const filteredEntries = useMemo(
    () =>
      allCalendarEntries.filter(
        (e) =>
          activeCategories.has(e.category) && (teamFilter === 'all' || e.entityName === teamFilter),
      ),
    [allCalendarEntries, activeCategories, teamFilter],
  );

  const [view, setView] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const jumpedRef = useRef(false);

  useEffect(() => {
    if (jumpedRef.current) return;
    if (entries === null || invites === null || allTournaments === null) return;
    jumpedRef.current = true;
    const today = todayISODate();
    const upcoming = allCalendarEntries
      .filter((e) => e.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    if (upcoming) setView(new Date(`${upcoming.startDate}T00:00:00`));
  }, [entries, invites, allTournaments, allCalendarEntries]);

  const cells = useMemo(() => buildMonthGrid(view.getFullYear(), view.getMonth()), [view]);
  const monthLabel = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const todayISO = todayISODate();

  const entriesByDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const cell of cells) {
      const iso = toISODate(cell);
      map.set(
        iso,
        filteredEntries.filter((e) => e.startDate <= iso && iso <= e.endDate),
      );
    }
    return map;
  }, [cells, filteredEntries]);

  const agendaEntries = useMemo(() => {
    const base = selectedDay
      ? (entriesByDay.get(selectedDay) ?? [])
      : filteredEntries.filter((e) => e.endDate >= todayISO || e.category !== 'completed');
    return [...base].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [selectedDay, entriesByDay, filteredEntries, todayISO]);

  const loading = entries === null || invites === null;
  const anyError = entriesError ?? invitesError;

  function renderEntryCard(e: CalendarEntry) {
    return (
      <div className={styles.entryCard} key={e.key}>
        <div className={styles.entryCardHead}>
          <Link to={`/tournaments/${e.tournamentId}`} className={styles.entryName}>
            {e.tournamentName}
          </Link>
          <span className={`${styles.categoryBadge ?? ''} ${CATEGORY_BADGE_CLASS[e.category]}`}>
            {CATEGORY_LABEL[e.category]}
          </span>
        </div>
        <p className={styles.entryMeta}>
          <span className="num">{formatRange(e.startDate, e.endDate)}</span>
          <span className={styles.entryMetaDot}>·</span>
          {e.entityName}
          {e.ageGroupLabel ? `, ${e.ageGroupLabel}` : ''}
          {e.locationCity || e.locationState ? (
            <>
              <span className={styles.entryMetaDot}>·</span>
              {[e.locationCity, e.locationState].filter(Boolean).join(', ')}
            </>
          ) : null}
        </p>
        {e.invitation && (
          <div className={styles.inviteActions}>
            <button
              type="button"
              className={styles.acceptBtn}
              disabled={busy === e.invitation.id}
              onClick={() => e.invitation && void respond(e.invitation, 'accept')}
            >
              Accept
            </button>
            <button
              type="button"
              className={styles.declineBtn}
              disabled={busy === e.invitation.id}
              onClick={() => setPendingDecline(e.invitation ?? null)}
            >
              Decline
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={shellStyles.page}>
      <PageTabs items={pageTabs} />

      <section className={shellStyles.panel} aria-label="My Tournaments">
        <header className={shellStyles.header}>
          <div>
            <h2 className={shellStyles.h2}>My Tournaments</h2>
            <p className={shellStyles.deck}>
              Every tournament across all your teams, laid out by date. What you&apos;re in, what
              you&apos;ve been invited to, and what&apos;s already wrapped up.
            </p>
          </div>
        </header>

        {anyError && <p className={shellStyles.empty}>{anyError}</p>}
        {respondError && <p className={styles.bannerError}>{respondError}</p>}

        {loading && !anyError && <p className={shellStyles.deck}>Loading…</p>}

        {!loading && !anyError && (
          <>
            <div className={styles.toolbar}>
              <div className={styles.filterChips} role="group" aria-label="Filter by status">
                {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => {
                  const on = activeCategories.has(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={on}
                      className={`${styles.filterChip ?? ''} ${on ? (styles.filterChipActive ?? '') : ''}`}
                      onClick={() => toggleCategory(cat)}
                    >
                      <span className={`${styles.dot ?? ''} ${CATEGORY_DOT_CLASS[cat]}`} />
                      {CATEGORY_LABEL[cat]}
                    </button>
                  );
                })}
              </div>

              {teamNames.length > 1 && (
                <label className={styles.teamFilter}>
                  <span className={styles.teamFilterLabel}>Team</span>
                  <select
                    className={styles.teamSelect}
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                  >
                    <option value="all">All teams</option>
                    {teamNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className={styles.calendarShell}>
              <div className={styles.calendarPanel}>
                <div className={styles.monthNav}>
                  <button
                    type="button"
                    className={styles.navBtn}
                    aria-label="Previous month"
                    onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
                  >
                    <Icon name="chevron-right" size={16} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                  <span className={styles.monthLabel}>{monthLabel}</span>
                  <button
                    type="button"
                    className={styles.navBtn}
                    aria-label="Next month"
                    onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
                  >
                    <Icon name="chevron-right" size={16} />
                  </button>
                  <button
                    type="button"
                    className={styles.todayBtn}
                    onClick={() => {
                      setView(new Date());
                      setSelectedDay(todayISODate());
                    }}
                  >
                    Today
                  </button>
                </div>

                <div className={styles.weekdays}>
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => (
                    <span key={w}>{w}</span>
                  ))}
                </div>

                <div className={styles.calendarGrid}>
                  {cells.map((cell) => {
                    const iso = toISODate(cell);
                    const outside = cell.getMonth() !== view.getMonth();
                    const dayEntries = entriesByDay.get(iso) ?? [];
                    const isToday = iso === todayISO;
                    const isSelected = iso === selectedDay;
                    return (
                      <button
                        type="button"
                        key={iso}
                        className={[
                          styles.calendarDay,
                          outside && styles.calendarDayOutside,
                          isToday && styles.calendarDayToday,
                          isSelected && styles.calendarDaySelected,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => setSelectedDay((d) => (d === iso ? null : iso))}
                        aria-pressed={isSelected}
                        aria-label={`${iso}${dayEntries.length ? `, ${dayEntries.length} tournament${dayEntries.length === 1 ? '' : 's'}` : ''}`}
                      >
                        <span className={styles.dayNumber}>{cell.getDate()}</span>
                        {dayEntries.length > 0 && (
                          <span className={styles.dayDots}>
                            {dayEntries.slice(0, MAX_DOTS_PER_DAY).map((e) => (
                              <span
                                key={e.key}
                                className={`${styles.dot ?? ''} ${CATEGORY_DOT_CLASS[e.category]}`}
                              />
                            ))}
                            {dayEntries.length > MAX_DOTS_PER_DAY && (
                              <span className={styles.dayMore}>
                                +{dayEntries.length - MAX_DOTS_PER_DAY}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={styles.agenda}>
                <div className={styles.agendaHead}>
                  <h3 className={styles.agendaTitle}>
                    {selectedDay ? formatDay(selectedDay) : 'Upcoming'}
                  </h3>
                  {selectedDay && (
                    <button
                      type="button"
                      className={styles.agendaClear}
                      onClick={() => setSelectedDay(null)}
                    >
                      Show all
                    </button>
                  )}
                </div>

                {agendaEntries.length === 0 ? (
                  <div className={shellStyles.empty}>
                    <span className={shellStyles.emptyIcon}>
                      <Icon name="trophy" size={26} />
                    </span>
                    <h3 className={shellStyles.emptyTitle}>
                      {selectedDay ? 'Nothing on this day' : 'Nothing to show'}
                    </h3>
                    <p className={shellStyles.emptyBody}>
                      {allCalendarEntries.length === 0
                        ? 'Once one of your teams is registered for or invited to a tournament, it shows up here.'
                        : 'Try a different day, or turn a filter above back on.'}
                    </p>
                  </div>
                ) : (
                  <div className={styles.entryList}>{agendaEntries.map(renderEntryCard)}</div>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={pendingDecline !== null}
        title="Decline this invitation?"
        message={
          pendingDecline
            ? `Decline the invitation to ${pendingDecline.tournamentName}? The organizer will see ${pendingDecline.entityName} declined.`
            : ''
        }
        confirmLabel="Decline"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (pendingDecline) void respond(pendingDecline, 'decline');
          setPendingDecline(null);
        }}
        onCancel={() => setPendingDecline(null)}
      />
    </div>
  );
}
