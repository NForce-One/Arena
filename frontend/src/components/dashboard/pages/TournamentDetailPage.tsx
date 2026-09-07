import type {
  ChildDto,
  FamilyRegistrationDto,
  PublicFixtureDto,
  PublicTournamentDetailDto,
  RecruitingTeamDto,
  RegistrationDto,
  TeamDto,
  TournamentAgeGroupDto,
  TournamentInvitationDto,
} from '@nforce/shared';
import {
  TEAM_SELECTION_MODE_LABELS,
  TOURNAMENT_GENDER_CATEGORY_LABELS,
  TOURNAMENT_STRUCTURE_LABELS,
} from '@nforce/shared';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../../../auth/AuthContext';
import { api, ApiError } from '../../../lib/apiClient';
import {
  ageGroupClosedSuffix,
  defaultOpenAgeGroupId,
  isAgeGroupRegistrationOpen,
  registrationWindowNote,
  summarizeAgeGroups,
  summarizeFormats,
} from '../../../lib/ageGroups';
import {
  eligibilityOverrideReason,
  shouldOfferEligibilityOverride,
} from '../../../lib/eligibility';
import { wallDay } from '../../../lib/calendar';
import { errorsFrom } from '../../../lib/forms';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { FixtureRow } from '../ui/FixtureRow';
import { Icon } from '../ui/Icon';
import styles from './TournamentDetailPage.module.css';

type Tab = 'fixtures' | 'results' | 'standings';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonthValue(v: string): string {
  const [y, m] = v.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? ''} ${y}`.trim();
}

function birthWindowLabel(bornAfter: string | null, bornBefore: string | null): string | null {
  if (bornAfter && bornBefore) {
    return `Born between ${formatMonthValue(bornAfter)} and ${formatMonthValue(bornBefore)}`;
  }
  if (bornAfter) return `Born after ${formatMonthValue(bornAfter)}`;
  if (bornBefore) return `Born before ${formatMonthValue(bornBefore)}`;
  return null;
}

function statusClass(status: string): string {
  if (status === 'published') return styles.statusPublished ?? '';
  if (status === 'closed') return styles.statusClosed ?? '';
  return styles.statusDraft ?? '';
}

function RegisterChildPanel({
  tournamentId,
  ageGroups,
}: {
  tournamentId: string;
  ageGroups: TournamentAgeGroupDto[];
}) {
  const [children, setChildren] = useState<ChildDto[] | null>(null);
  const [registrations, setRegistrations] = useState<FamilyRegistrationDto[]>([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [selectedAgeGroupId, setSelectedAgeGroupId] = useState(() =>
    defaultOpenAgeGroupId(ageGroups),
  );
  const [error, setError] = useState<string | null>(null);
  const [profileLink, setProfileLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<{ id: string; childName: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const [childData, regData] = await Promise.all([
        api<{ children: ChildDto[] }>('/api/parent/children'),
        api<{ registrations: FamilyRegistrationDto[] }>('/api/parent/registrations'),
      ]);
      setChildren(childData.children);
      setRegistrations(regData.registrations.filter((r) => r.tournamentId === tournamentId));
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }, [tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function registerChild() {
    if (!selectedChild || !selectedAgeGroupId) return;
    setError(null);
    setProfileLink(null);
    setBusy(true);
    try {
      await api(`/api/parent/children/${selectedChild}/tournaments/${tournamentId}/register`, {
        body: { tournamentAgeGroupId: selectedAgeGroupId },
      });
      setSelectedChild('');
      await load();
    } catch (err) {
      setError(errorsFrom(err).banner);
      if (err instanceof ApiError) {
        if (
          err.code === 'PROFILE_INCOMPLETE' ||
          err.code === 'GENDER_CATEGORY_MISMATCH' ||
          err.code === 'GENDER_REQUIRED'
        ) {
          setProfileLink(`/parent/children/${selectedChild}/cricket-profile`);
        } else if (err.code === 'DOB_REQUIRED') {
          setProfileLink('/parent');
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function doWithdraw(registrationId: string) {
    setError(null);
    try {
      await api(`/api/registrations/${registrationId}/withdraw`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }

  if (!children || children.length === 0) return null;

  const activeRegs = registrations.filter((r) => r.status === 'active');
  const registeredPairs = new Set(activeRegs.map((r) => `${r.childId}:${r.tournamentAgeGroupId}`));
  const childById = new Map(children.map((c) => [c.id, c]));
  const unregisteredChildren = children.filter(
    (c) => c.isMinor && ageGroups.some((ag) => !registeredPairs.has(`${c.id}:${ag.id}`)),
  );
  const soleAgeGroup = ageGroups.length === 1 ? ageGroups[0] : undefined;
  const soleAgeGroupClosed =
    soleAgeGroup !== undefined && !isAgeGroupRegistrationOpen(soleAgeGroup);

  return (
    <div className={styles.recruitTeamsBlock}>
      <h4 className={styles.recruitTeamsHead}>Register a child</h4>
      {error && (
        <p className={styles.banner}>
          {error}
          {profileLink && (
            <>
              {' '}
              <Link to={profileLink} className={styles.bannerLink}>
                Complete it now
              </Link>
            </>
          )}
        </p>
      )}
      {activeRegs.map((r) => (
        <div className={styles.regRow} key={r.registrationId} style={{ marginBottom: 8 }}>
          <span className={styles.regText}>
            {r.childName} is registered{ageGroups.length > 1 ? ` for ${r.ageGroupLabel}` : ''}.
          </span>
          {(childById.get(r.childId)?.isMinor ?? true) && (
            <button
              className={styles.btnGhost}
              onClick={() => setWithdrawTarget({ id: r.registrationId, childName: r.childName })}
            >
              Withdraw
            </button>
          )}
        </div>
      ))}
      {unregisteredChildren.length > 0 && (
        <div className={styles.formRow}>
          <select
            className={styles.select}
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
          >
            <option value="">Select a child…</option>
            {unregisteredChildren.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {ageGroups.length > 1 && (
            <select
              className={styles.select}
              aria-label="Age group"
              value={selectedAgeGroupId}
              onChange={(e) => setSelectedAgeGroupId(e.target.value)}
            >
              {ageGroups.map((ag) => {
                const open = isAgeGroupRegistrationOpen(ag);
                return (
                  <option key={ag.id} value={ag.id} disabled={!open}>
                    {ag.name} · {TOURNAMENT_GENDER_CATEGORY_LABELS[ag.genderCategory]}
                    {!open && ageGroupClosedSuffix(ag)}
                  </option>
                );
              })}
            </select>
          )}
          {soleAgeGroup && soleAgeGroupClosed && (
            <span className={styles.regWindowNote}>{registrationWindowNote(soleAgeGroup)}</span>
          )}
          <button
            className={styles.btnPrimary}
            disabled={!selectedChild || !selectedAgeGroupId || busy || soleAgeGroupClosed}
            onClick={() => void registerChild()}
          >
            Register child
          </button>
        </div>
      )}

      <ConfirmDialog
        open={withdrawTarget !== null}
        title="Withdraw from this tournament?"
        message={
          withdrawTarget
            ? `Withdraw ${withdrawTarget.childName} from this tournament? They can register again later if there's room.`
            : ''
        }
        confirmLabel="Withdraw"
        onConfirm={() => {
          if (withdrawTarget) void doWithdraw(withdrawTarget.id);
          setWithdrawTarget(null);
        }}
        onCancel={() => setWithdrawTarget(null)}
      />
    </div>
  );
}

function RegisterPanel({
  tournamentId,
  status,
  ageGroups,
  refreshKey,
}: {
  tournamentId: string;
  status: string;
  ageGroups: TournamentAgeGroupDto[];
  refreshKey?: number;
}) {
  const { user } = useAuth();
  const [mine, setMine] = useState<RegistrationDto[] | null>(null);
  const [myTeams, setMyTeams] = useState<TeamDto[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedAgeGroupId, setSelectedAgeGroupId] = useState(() =>
    defaultOpenAgeGroupId(ageGroups),
  );
  const [error, setError] = useState<string | null>(null);
  const [profileLink, setProfileLink] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm(): void;
  } | null>(null);
  const isPlayer = user?.roles.includes('player') ?? false;
  const isManager = user?.roles.includes('team_manager') ?? false;
  const isParent = user?.roles.includes('parent') ?? false;

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const requests: Promise<unknown>[] = [
        api<{ registrations: RegistrationDto[] }>(
          `/api/tournaments/${tournamentId}/my-registrations`,
        ),
      ];
      if (isManager) requests.push(api<{ teams: TeamDto[] }>('/api/teams/mine'));
      const [regData, teamData] = await Promise.all(requests);
      setMine((regData as { registrations: RegistrationDto[] }).registrations);
      if (teamData) setMyTeams((teamData as { teams: TeamDto[] }).teams);
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }, [tournamentId, user, isManager]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function register(teamId?: string, overrideEligibility = false) {
    if (!selectedAgeGroupId) return;
    setError(null);
    setProfileLink(null);
    try {
      await api(`/api/tournaments/${tournamentId}/register`, {
        body: {
          tournamentAgeGroupId: selectedAgeGroupId,
          ...(teamId ? { teamId, overrideEligibility } : {}),
        },
      });
      setSelectedTeam('');
      await load();
    } catch (err) {
      if (teamId && !overrideEligibility && shouldOfferEligibilityOverride(err)) {
        setPendingConfirm({
          title: "This doesn't meet the requirements",
          message: `${eligibilityOverrideReason(err)} Do you want to proceed anyway?`,
          confirmLabel: 'Proceed anyway',
          onConfirm: () => void register(teamId, true),
        });
        return;
      }
      setError(errorsFrom(err).banner);
      if (err instanceof ApiError) {
        if (
          err.code === 'PROFILE_INCOMPLETE' ||
          err.code === 'GENDER_CATEGORY_MISMATCH' ||
          err.code === 'GENDER_REQUIRED'
        ) {
          setProfileLink('/profile/cricket');
        } else if (err.code === 'DOB_REQUIRED') {
          setProfileLink('/profile');
        }
      }
    }
  }

  async function doWithdraw(registrationId: string) {
    setError(null);
    try {
      await api(`/api/registrations/${registrationId}/withdraw`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }

  function withdraw(registrationId: string, label: string) {
    setPendingConfirm({
      title: 'Withdraw from this tournament?',
      message: `Withdraw ${label} from this tournament? You can register again later if there's room.`,
      confirmLabel: 'Withdraw',
      onConfirm: () => void doWithdraw(registrationId),
    });
  }

  if (!user || status !== 'published' || (!isPlayer && !isManager && !isParent)) return null;
  if (mine === null) return null;

  const playerRegs = mine.filter((r) => r.entityType === 'player');
  const playerRegisteredBracketIds = new Set(playerRegs.map((r) => r.tournamentAgeGroupId));
  const unregisteredAgeGroups = ageGroups.filter((ag) => !playerRegisteredBracketIds.has(ag.id));
  const teamRegs = mine.filter((r) => r.entityType === 'team');
  const registeredTeamIdsForSelectedBracket = new Set(
    teamRegs.filter((r) => r.tournamentAgeGroupId === selectedAgeGroupId).map((r) => r.entityId),
  );
  const unregisteredTeams = myTeams.filter((t) => !registeredTeamIdsForSelectedBracket.has(t.id));
  const soleAgeGroup = ageGroups.length === 1 ? ageGroups[0] : undefined;
  const singleBracketClosed =
    soleAgeGroup !== undefined && !isAgeGroupRegistrationOpen(soleAgeGroup);

  return (
    <section className={styles.panel} aria-label="Registration">
      <h3 className={styles.h3}>Registration</h3>
      {error && (
        <p className={styles.banner}>
          {error}
          {profileLink && (
            <>
              {' '}
              <Link to={profileLink} className={styles.bannerLink}>
                Complete it now
              </Link>
            </>
          )}
        </p>
      )}

      {ageGroups.length > 1 &&
        (unregisteredAgeGroups.length > 0 || unregisteredTeams.length > 0) && (
          <label className={styles.formRow}>
            <span className={styles.regText}>Age group</span>
            <select
              className={styles.select}
              aria-label="Age group"
              value={selectedAgeGroupId}
              onChange={(e) => setSelectedAgeGroupId(e.target.value)}
            >
              {ageGroups.map((ag) => {
                const open = isAgeGroupRegistrationOpen(ag);
                return (
                  <option key={ag.id} value={ag.id} disabled={!open}>
                    {ag.name} · {TOURNAMENT_GENDER_CATEGORY_LABELS[ag.genderCategory]}
                    {!open && ageGroupClosedSuffix(ag)}
                  </option>
                );
              })}
            </select>
          </label>
        )}

      {soleAgeGroup &&
        singleBracketClosed &&
        (unregisteredAgeGroups.length > 0 || unregisteredTeams.length > 0) && (
          <p className={styles.regWindowNote}>{registrationWindowNote(soleAgeGroup)}</p>
        )}

      {isPlayer && (
        <>
          {playerRegs.map((reg) => (
            <div className={styles.regRow} key={reg.id}>
              <span className={styles.regText}>
                {ageGroups.length > 1 ? `Registered for ${reg.ageGroupLabel}` : 'Registered'},
                looking for a team.
              </span>
              {reg.eligible === false && (
                <span className="chip chip-warn" title="Doesn't meet this age group's requirements">
                  Doesn't meet requirements
                </span>
              )}
              <button className={styles.btnGhost} onClick={() => withdraw(reg.id, 'yourself')}>
                Withdraw
              </button>
            </div>
          ))}
          {playerRegs.length > 0 && <RecruitingTeams tournamentId={tournamentId} />}
          {unregisteredAgeGroups.length > 0 && (
            <div className={styles.regRow}>
              <button
                className={styles.btnPrimary}
                disabled={!selectedAgeGroupId || singleBracketClosed}
                onClick={() => void register()}
              >
                Register myself
              </button>
            </div>
          )}
        </>
      )}

      {isManager && (
        <>
          {teamRegs.map((r) => (
            <div className={styles.regRow} key={r.id} style={{ marginBottom: 8 }}>
              <span className={styles.regText}>
                {r.entityName}{' '}
                {ageGroups.length > 1 ? `is registered for ${r.ageGroupLabel}.` : 'is registered.'}
              </span>
              {r.eligible === false && (
                <span
                  className="chip chip-warn"
                  title="At least one accepted roster member doesn't meet this age group's requirements"
                >
                  Doesn't meet requirements
                </span>
              )}
              <button className={styles.btnGhost} onClick={() => withdraw(r.id, r.entityName)}>
                Withdraw
              </button>
            </div>
          ))}
          {unregisteredTeams.length > 0 && (
            <div className={`${styles.formRow} ${styles.teamSelectRow}`}>
              <select
                className={styles.select}
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
              >
                <option value="">Select a team…</option>
                {unregisteredTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                className={styles.btnPrimary}
                disabled={!selectedTeam || !selectedAgeGroupId || singleBracketClosed}
                onClick={() => void register(selectedTeam)}
              >
                Register team
              </button>
            </div>
          )}
        </>
      )}

      {isParent && <RegisterChildPanel tournamentId={tournamentId} ageGroups={ageGroups} />}

      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? ''}
        confirmLabel={pendingConfirm?.confirmLabel}
        cancelLabel="Cancel"
        onConfirm={() => {
          pendingConfirm?.onConfirm();
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </section>
  );
}

function MyTournamentInvitation({
  tournamentId,
  onChanged,
}: {
  tournamentId: string;
  onChanged(): void;
}) {
  const [invitation, setInvitation] = useState<TournamentInvitationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'accept' | 'decline' | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ invitation: TournamentInvitationDto | null }>(
        `/api/tournaments/${tournamentId}/my-invitation`,
      );
      setInvitation(data.invitation);
    } catch {
      setInvitation(null);
    }
  }, [tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(decision: 'accept' | 'decline') {
    if (!invitation) return;
    setPendingDecision(null);
    setError(null);
    setBusy(true);
    try {
      await api(`/api/player-invitations/${invitation.id}/respond`, { body: { decision } });
      await load();
      onChanged();
    } catch (err) {
      setError(errorsFrom(err).banner);
    } finally {
      setBusy(false);
    }
  }

  if (!invitation) return null;

  return (
    <section className={styles.panel} aria-label="Tournament invitation">
      <h3 className={styles.h3}>You've been invited</h3>
      {error && <p className={styles.banner}>{error}</p>}
      <div className={styles.regRow}>
        <span className={styles.regText}>
          The organizer invited you to register for the {invitation.ageGroupLabel} tournament.
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={styles.btnPrimary}
            disabled={busy}
            onClick={() => setPendingDecision('accept')}
          >
            Accept
          </button>
          <button
            className={styles.btnGhost}
            disabled={busy}
            onClick={() => setPendingDecision('decline')}
          >
            Decline
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={pendingDecision !== null}
        title={
          pendingDecision === 'accept' ? 'Accept this invitation?' : 'Decline this invitation?'
        }
        message={
          pendingDecision === 'accept'
            ? `Register for the ${invitation.ageGroupLabel} tournament?`
            : `Decline this invitation to the ${invitation.ageGroupLabel} tournament? The organizer will need to invite you again if you change your mind.`
        }
        confirmLabel={pendingDecision === 'accept' ? 'Accept' : 'Decline'}
        onConfirm={() => pendingDecision && void respond(pendingDecision)}
        onCancel={() => setPendingDecision(null)}
      />
    </section>
  );
}

function RecruitingTeams({ tournamentId }: { tournamentId: string }) {
  const [teams, setTeams] = useState<RecruitingTeamDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());

  useEffect(() => {
    void api<{ teams: RecruitingTeamDto[] }>(`/api/tournaments/${tournamentId}/recruiting-teams`)
      .then((data) => setTeams(data.teams))
      .catch((err) => setError(errorsFrom(err).banner));
  }, [tournamentId]);

  async function requestToJoin(teamId: string) {
    setError(null);
    try {
      await api(`/api/teams/${teamId}/roster/request`, { body: {} });
      setRequested((prev) => new Set(prev).add(teamId));
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }

  if (!teams || teams.length === 0) return null;

  return (
    <div className={styles.recruitTeamsBlock}>
      <h4 className={styles.recruitTeamsHead}>Looking to join a team?</h4>
      {error && <p className={styles.banner}>{error}</p>}
      <div className={styles.recruitTeamsList}>
        {teams.map((t) => (
          <div className={styles.recruitTeamRow} key={t.teamId}>
            <span className={styles.recruitTeamName}>{t.name}</span>
            {requested.has(t.teamId) ? (
              <span className={styles.requestedTag}>Requested</span>
            ) : (
              <button className={styles.btnGhost} onClick={() => void requestToJoin(t.teamId)}>
                Request to join
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardTournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [tournament, setTournament] = useState<PublicTournamentDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('fixtures');
  const [myTeamName, setMyTeamName] = useState<string | null>(null);

  const [pillReady, setPillReady] = useState(false);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement | null>());
  const [regRefresh, setRegRefresh] = useState(0);

  useEffect(() => {
    if (!id) return;
    void api<{ tournament: PublicTournamentDetailDto }>(`/api/public/tournaments/${id}`)
      .then((data) => setTournament(data.tournament))
      .catch((err: unknown) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'Tournament not found.'
            : 'Could not load this tournament.',
        ),
      );
  }, [id]);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    void api<{ registrations: RegistrationDto[] }>(`/api/tournaments/${id}/my-registrations`)
      .then((data) => {
        if (cancelled) return;
        const teamReg = data.registrations.find(
          (r) => r.status === 'active' && r.entityType === 'team',
        );
        setMyTeamName(teamReg?.entityName ?? null);
      })
      .catch(() => {
      });
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  useLayoutEffect(() => {
    const el = tabRefs.current.get(tab);
    if (!el) return;
    setPill({ left: el.offsetLeft, width: el.offsetWidth });
    const raf = requestAnimationFrame(() => setPillReady(true));
    return () => cancelAnimationFrame(raf);
  }, [tab, tournament]);

  if (error) {
    return (
      <div className={styles.page}>
        <section className={styles.panel}>
          <p className={styles.banner}>{error}</p>
          <Link to="/tournaments" className={styles.backLink}>
            <Icon name="arrow-right" size={14} style={{ transform: 'rotate(180deg)' }} />
            Back to tournaments
          </Link>
        </section>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className={styles.page}>
        <section className={styles.panel}>
          <p className={styles.deck}>Loading…</p>
        </section>
      </div>
    );
  }

  const upcoming = tournament.fixtures.filter((f) => !f.result);
  const played = tournament.fixtures.filter((f) => f.result);
  const tournamentName = tournament.name;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'fixtures', label: `Fixtures (${upcoming.length})` },
    { id: 'results', label: `Results (${played.length})` },
    { id: 'standings', label: 'Points table' },
  ];

  function renderFixtureList(list: PublicFixtureDto[], emptyLabel: string) {
    if (list.length === 0) {
      return (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon name="calendar" size={26} />
          </span>
          <p className={styles.emptyBody}>{emptyLabel}</p>
        </div>
      );
    }
    return (
      <div className={styles.rows}>
        {list.map((f, i) => (
          <FixtureRow
            key={f.id}
            fixture={f}
            tournamentName={tournamentName}
            perspective={myTeamName}
            index={i}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link to="/tournaments" className={styles.backLink}>
        <Icon name="arrow-right" size={14} style={{ transform: 'rotate(180deg)' }} />
        All tournaments
      </Link>

      {tournament.status === 'draft' && (
        <p className={styles.previewBanner} role="status">
          <b>Draft preview</b>. This is how the page will look once you publish. No one else can see
          this yet.
        </p>
      )}

      <div className={styles.headerRow}>
        <h1 className={styles.title}>{tournament.name}</h1>
        <span className={`${styles.status} ${statusClass(tournament.status)}`}>
          {tournament.status}
        </span>
      </div>
      <p className={styles.deck}>
        {summarizeFormats(tournament.ageGroups)} · {summarizeAgeGroups(tournament.ageGroups)} ·
        organized by {tournament.organizerName}
        {tournament.organizerAcademyName ? ` (${tournament.organizerAcademyName})` : ''}
      </p>

      <section className={styles.panel} aria-label="Tournament details">
        {tournament.description && <p className={styles.deck}>{tournament.description}</p>}

        <div className={styles.infoCardGrid}>
          <div className={styles.infoCard}>
            <div className={styles.infoCardHead}>
              <span className={styles.infoCardIcon}>
                <Icon name="clipboard" size={16} />
              </span>
              <h3 className={styles.infoCardTitle}>Basics</h3>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Structure</span>
              <span className={styles.infoValue}>
                {TOURNAMENT_STRUCTURE_LABELS[tournament.structure]}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Team selection</span>
              <span className={styles.infoValue}>
                {TEAM_SELECTION_MODE_LABELS[tournament.teamSelectionMode]}
              </span>
            </div>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.infoCardHead}>
              <span className={styles.infoCardIcon}>
                <Icon name="calendar" size={16} />
              </span>
              <h3 className={styles.infoCardTitle}>Schedule</h3>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Dates</span>
              <span className={`${styles.infoValue ?? ''} num`}>
                {wallDay(tournament.startDate)} – {wallDay(tournament.endDate)}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>
                {tournament.teamSelectionMode === 'draft_based' ? 'Players' : 'Team slots'}
              </span>
              <span className={`${styles.infoValue ?? ''} num`}>
                {tournament.capacity != null
                  ? `${tournament.registeredCount} / ${tournament.capacity}`
                  : tournament.registeredCount}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Teams</span>
              <span className={`${styles.infoValue ?? ''} num`}>{tournament.teamsCount}</span>
            </div>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.infoCardHead}>
              <span className={styles.infoCardIcon}>
                <Icon name="map-pin" size={16} />
              </span>
              <h3 className={styles.infoCardTitle}>Location &amp; surface</h3>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Location</span>
              <span className={styles.infoValue}>
                {tournament.locationCity || tournament.locationState
                  ? [tournament.locationCity, tournament.locationState].filter(Boolean).join(', ')
                  : 'Not set'}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Surface</span>
              <span className={styles.infoValue}>{tournament.surfaceTypeName ?? 'Not set'}</span>
            </div>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.infoCardHead}>
              <span className={styles.infoCardIcon}>
                <Icon name="star" size={16} />
              </span>
              <h3 className={styles.infoCardTitle}>Entry &amp; prizes</h3>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Prize pool</span>
              <span className={`${styles.infoValue ?? ''} num`}>
                {tournament.prizePoolAmount != null ? tournament.prizePoolAmount : 'Not set'}
              </span>
            </div>
            {tournament.teamSelectionMode === 'prebuilt_rosters' &&
              tournament.maxMarqueePlayers != null && (
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Max marquee players</span>
                  <span className={`${styles.infoValue ?? ''} num`}>
                    {tournament.maxMarqueePlayers}
                  </span>
                </div>
              )}
          </div>
        </div>

        {tournament.prizePoolDescription && (
          <p className={styles.deck}>{tournament.prizePoolDescription}</p>
        )}
        {tournament.rules && (
          <>
            <h3 className={styles.h3}>Rules</h3>
            <p className={styles.deck}>{tournament.rules}</p>
          </>
        )}
        {tournament.rulesDocumentUrl && (
          <a
            className={styles.btnGhost}
            href={tournament.rulesDocumentUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="clipboard" size={14} />
            Download rules document
          </a>
        )}

        <h3 className={styles.h3}>Age groups</h3>
        <div className={styles.ageGroupDetailList}>
          {tournament.ageGroups.map((ag) => (
            <div key={ag.id} className={styles.ageGroupDetailCard}>
              <span className="chip">
                {ag.name} · {TOURNAMENT_GENDER_CATEGORY_LABELS[ag.genderCategory]} · {ag.format}
              </span>
              <p className={styles.deck} style={{ margin: '6px 0 0' }}>
                Registration: {wallDay(ag.registrationStartDate)} –{' '}
                {wallDay(ag.registrationEndDate)}
                {birthWindowLabel(ag.bornAfter, ag.bornBefore)
                  ? ` · ${birthWindowLabel(ag.bornAfter, ag.bornBefore)}`
                  : ''}
                {' · '}
                {ag.entryFee != null ? `${ag.entryFee} entry fee` : 'Free to register'}
                {ag.oversPerInnings != null ? ` · ${ag.oversPerInnings} overs` : ''}
              </p>
            </div>
          ))}
        </div>
      </section>

      {user && user.roles.includes('player') && (
        <MyTournamentInvitation
          tournamentId={tournament.id}
          onChanged={() => setRegRefresh((n) => n + 1)}
        />
      )}
      <RegisterPanel
        tournamentId={tournament.id}
        status={tournament.status}
        ageGroups={tournament.ageGroups}
        refreshKey={regRefresh}
      />

      <section className={styles.panel} aria-label="Fixtures, results and standings">
        <div className={styles.tabs} role="tablist" aria-label="View">
          <span
            className={`${styles.pill ?? ''} ${pillReady ? (styles.pillReady ?? '') : ''}`}
            style={{ transform: `translateX(${pill.left}px)`, width: `${pill.width}px` }}
            aria-hidden="true"
          />
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current.set(t.id, el);
              }}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`${styles.tab ?? ''} ${tab === t.id ? (styles.tabActive ?? '') : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'fixtures' && renderFixtureList(upcoming, 'No upcoming matches.')}
        {tab === 'results' && renderFixtureList(played, 'No results yet.')}

        {tab === 'standings' &&
          (tournament.standings.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <Icon name="trophy" size={26} />
              </span>
              <p className={styles.emptyBody}>Standings appear once results are entered.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={`${styles.table} table-mobile`}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Team</th>
                    <th>Played</th>
                    <th>Won</th>
                    <th>Lost</th>
                    <th>Drawn</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {tournament.standings.map((s, i) => (
                    <tr key={s.team} className={i === 0 ? styles.leaderRow : undefined}>
                      <td data-label="Rank" className={styles.numCell}>
                        {i + 1}
                      </td>
                      <td data-label="Team">
                        <strong>{s.team}</strong>
                      </td>
                      <td data-label="Played" className={styles.numCell}>
                        {s.played}
                      </td>
                      <td data-label="Won" className={styles.numCell}>
                        {s.won}
                      </td>
                      <td data-label="Lost" className={styles.numCell}>
                        {s.lost}
                      </td>
                      <td data-label="Drawn" className={styles.numCell}>
                        {s.drawn}
                      </td>
                      <td data-label="Points" className={styles.numCell}>
                        <strong>{s.points}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </section>
    </div>
  );
}
