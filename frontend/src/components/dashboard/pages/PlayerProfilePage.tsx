import {
  battingStyleLabel,
  bowlingStyleLabel,
  GENDER_LABELS,
  HEIGHT_UNIT_LABELS,
  JERSEY_SIZE_LABELS,
  PLAYING_ROLE_LABELS,
  WEIGHT_UNIT_LABELS,
  type PublicPlayerProfileDto,
} from '@nforce/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, ApiError } from '../../../lib/apiClient';
import { Icon } from '../ui/Icon';
import styles from './PlayerProfilePage.module.css';

function jerseyDetail(player: PublicPlayerProfileDto): string {
  const parts: string[] = [];
  if (player.jerseyNumber != null) parts.push(`#${player.jerseyNumber}`);
  if (player.jerseyName) parts.push(`"${player.jerseyName}"`);
  const bits = parts.join(' ');
  const size = player.jerseySize ? JERSEY_SIZE_LABELS[player.jerseySize] : null;
  if (bits && size) return `${bits} · ${size}`;
  return bits || size || '';
}

export function DashboardPlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [player, setPlayer] = useState<PublicPlayerProfileDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setPlayer(null);
    setError(null);
    void api<{ player: PublicPlayerProfileDto }>(`/api/public/players/${id}`)
      .then((data) => setPlayer(data.player))
      .catch((err: unknown) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'Player not found.'
            : 'Could not load this profile.',
        ),
      );
  }, [id]);

  if (error) {
    return (
      <div className={styles.page}>
        <section className={styles.panel} aria-label="Player profile">
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
          <Link to="/tournaments" className={styles.backLink}>
            <Icon name="chevron-right" size={14} />
            <span>Back to tournaments</span>
          </Link>
        </section>
      </div>
    );
  }

  if (!player) {
    return (
      <div className={styles.page}>
        <section className={styles.panel} aria-label="Player profile">
          <p className={styles.deck}>Loading…</p>
        </section>
      </div>
    );
  }

  const initial = player.name.slice(0, 1).toUpperCase();

  const details: { label: string; value: string }[] = [
    { label: 'Jersey', value: jerseyDetail(player) },
    { label: 'School', value: player.school ?? '' },
    {
      label: 'Batting',
      value: battingStyleLabel(player.battingStyle, player.battingStyleOther),
    },
    {
      label: 'Bowling',
      value: bowlingStyleLabel(player.bowlingStyle, player.bowlingStyleOther),
    },
    { label: 'Role', value: player.playingRole ? PLAYING_ROLE_LABELS[player.playingRole] : '' },
    {
      label: 'Height',
      value:
        player.heightValue != null && player.heightUnit
          ? `${player.heightValue} ${HEIGHT_UNIT_LABELS[player.heightUnit]}`
          : '',
    },
    {
      label: 'Weight',
      value:
        player.weightValue != null && player.weightUnit
          ? `${player.weightValue} ${WEIGHT_UNIT_LABELS[player.weightUnit]}`
          : '',
    },
    { label: 'Gender', value: player.gender ? GENDER_LABELS[player.gender] : '' },
  ].filter((d) => d.value);

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="Player profile">
        <header className={styles.header}>
          <span className={styles.avatarDisc} aria-hidden="true">
            {player.photoUrl ? (
              <img src={player.photoUrl} alt="" className={styles.avatarImg} />
            ) : (
              <span className={styles.avatarInitial}>{initial}</span>
            )}
          </span>
          <div>
            <h2 className={styles.h2}>{player.name}</h2>
            <p className={styles.deck}>
              Tournament statistics, per tournament, no combined totals.
            </p>
          </div>
        </header>

        {(details.length > 0 || player.consentConfirmed) && (
          <div className={styles.detailsBlock}>
            {details.length > 0 && (
              <dl className={styles.detailsGrid}>
                {details.map((d) => (
                  <div className={styles.detailItem} key={d.label}>
                    <dt className={styles.detailLabel}>{d.label}</dt>
                    <dd className={styles.detailValue}>{d.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {player.consentConfirmed && (
              <span className={styles.consentBadge}>
                <Icon name="shield-check" size={13} />
                <span>Consent confirmed{player.consentDate ? ` · ${player.consentDate}` : ''}</span>
              </span>
            )}
          </div>
        )}

        {player.tournaments.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>
              This player hasn&apos;t taken part in any tournaments yet.
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={`${styles.table} table-mobile`}>
              <thead>
                <tr>
                  <th>Tournament</th>
                  <th>Team</th>
                  <th>Role</th>
                  <th className={styles.num}>Played</th>
                  <th className={styles.num}>Won</th>
                  <th className={styles.num}>Lost</th>
                  <th className={styles.num}>Runs</th>
                </tr>
              </thead>
              <tbody>
                {player.tournaments.map((t) => (
                  <tr key={`${t.tournamentId}-${t.teamName}`}>
                    <td data-label="Tournament">
                      <Link to={`/tournaments/${t.tournamentId}`} className={styles.tournamentLink}>
                        {t.tournamentName}
                      </Link>
                    </td>
                    <td data-label="Team">{t.teamName}</td>
                    <td data-label="Role" className={styles.muted}>
                      {t.roleInTeam}
                    </td>
                    <td data-label="Played" className={styles.num}>
                      {t.played}
                    </td>
                    <td data-label="Won" className={styles.num}>
                      {t.won}
                    </td>
                    <td data-label="Lost" className={styles.num}>
                      {t.lost}
                    </td>
                    <td data-label="Runs" className={styles.num}>
                      {t.runsScored}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
