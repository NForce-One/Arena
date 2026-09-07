import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import { MatchRow, matchesQuery, type UmpireOutletContext } from './UmpireLayout';
import styles from './UmpirePage.module.css';

export function DashboardUmpireInvitesPage() {
  const { open, busyIds, respond } = useOutletContext<UmpireOutletContext>();
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();
  const [declineTarget, setDeclineTarget] = useState<{
    id: string;
    homeTeam: string;
    awayTeam: string;
  } | null>(null);

  const invitesList = useMemo(() => (open ?? []).filter((f) => f.myStatus === 'invited'), [open]);
  const visibleInvites = useMemo(
    () =>
      invitesList.filter((f) =>
        matchesQuery(q, f.homeTeam, f.awayTeam, f.tournamentName, f.ground),
      ),
    [invitesList, q],
  );

  const emptyTitle = q ? `No invites match "${query.trim()}"` : 'No pending invites.';
  const emptyBody = q
    ? 'Try a different team, tournament or ground name.'
    : "When an organizer invites you to officiate a match, it'll show up here to accept or decline.";

  return (
    <section className={styles.panel} aria-label="Invites">
      <header className={styles.header}>
        <div>
          <h2 className={styles.h2}>Invites {open !== null && `(${invitesList.length})`}</h2>
          <p className={styles.deck}>
            Matches an organizer has asked you to officiate. Accept or decline.
          </p>
        </div>
      </header>

      {open === null && <p className={styles.deck}>Loading…</p>}

      {open !== null &&
        (visibleInvites.length > 0 ? (
          <div key={`invites-${q}`} className={styles.rows}>
            {visibleInvites.map((f, i) => (
              <MatchRow
                key={f.id}
                id={f.id}
                homeTeam={f.homeTeam}
                awayTeam={f.awayTeam}
                tournamentName={f.tournamentName}
                ground={f.ground}
                startsAt={f.startsAt}
                index={i}
                action={
                  <div className={styles.actionGroup}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={busyIds.has(f.id)}
                      onClick={() => void respond(f.id, 'accept')}
                    >
                      {busyIds.has(f.id) ? 'Accepting…' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      disabled={busyIds.has(f.id)}
                      onClick={() =>
                        setDeclineTarget({ id: f.id, homeTeam: f.homeTeam, awayTeam: f.awayTeam })
                      }
                    >
                      Decline
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <div key={`invites-empty-${q}`} className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Icon name="shield-check" size={30} />
            </span>
            <h3 className={styles.emptyTitle}>{emptyTitle}</h3>
            <p className={styles.emptyBody}>{emptyBody}</p>
          </div>
        ))}

      <ConfirmDialog
        open={declineTarget !== null}
        title="Decline this invite?"
        message={
          declineTarget
            ? `Decline officiating ${declineTarget.homeTeam} vs ${declineTarget.awayTeam}? The organizer will need to find another umpire.`
            : ''
        }
        confirmLabel="Decline"
        onConfirm={() => {
          if (declineTarget) void respond(declineTarget.id, 'decline');
          setDeclineTarget(null);
        }}
        onCancel={() => setDeclineTarget(null)}
      />
    </section>
  );
}
