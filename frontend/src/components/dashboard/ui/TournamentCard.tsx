import type { PublicTournamentSummaryDto } from '@nforce/shared';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon';
import { hasYouthAgeGroup, summarizeAgeGroups, summarizeFormats } from '../../../lib/ageGroups';
import { deriveTournamentState } from '../../../lib/tournamentState';
import styles from './TournamentCard.module.css';

interface Props {
  tournament: PublicTournamentSummaryDto;
  index?: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatRange(startISO: string, endISO: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startLabel = `${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const endLabel = `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;
  if (sameYear) {
    return { line: `${startLabel} – ${endLabel}`, year: `${start.getUTCFullYear()}` };
  }
  return {
    line: `${startLabel}, ${start.getUTCFullYear()} – ${endLabel}, ${end.getUTCFullYear()}`,
    year: '',
  };
}

export function TournamentCard({ tournament, index = 0 }: Props) {
  const state = deriveTournamentState(tournament);
  const range = formatRange(tournament.startDate, tournament.endDate);
  const stagger: CSSProperties = { animationDelay: `${60 + index * 40}ms` };
  const teamsWord = tournament.teamsCount === 1 ? 'team' : 'teams';
  const youth = hasYouthAgeGroup(tournament.ageGroups);

  return (
    <Link
      to={`/tournaments/${tournament.id}`}
      className={`${styles.card ?? ''} ${styles[state] ?? ''}`}
      style={stagger}
      aria-label={`${tournament.name}, ${state}`}
    >
      <div className={styles.body}>
        <div className={styles.headline}>
          {state === 'live' && (
            <span className={styles.pulseWrap} aria-hidden="true">
              <span className={styles.pulse} />
              <span className={styles.pulseWord}>LIVE</span>
            </span>
          )}
          <h3 className={styles.name}>{tournament.name}</h3>
          {state === 'closed' && <span className={styles.closedTag}>Closed</span>}
        </div>
        <p className={styles.meta}>
          <span className={styles.metaLeft}>
            <span className={styles.format}>{summarizeFormats(tournament.ageGroups)}</span>
            <span
              className={`${styles.age ?? ''} ${youth ? (styles.ageYouth ?? '') : ''}`}
              title={summarizeAgeGroups(tournament.ageGroups)}
            >
              {summarizeAgeGroups(tournament.ageGroups)}
            </span>
          </span>
          {}
          <span className={styles.metaRight}>
            <span
              className={`${styles.teams ?? ''} ${tournament.teamsCount === 0 ? (styles.teamsEmpty ?? '') : ''}`}
            >
              <Icon name="users" size={13} />
              <span>
                {tournament.teamsCount} {teamsWord}
              </span>
            </span>
            <span
              className={styles.metaMuted}
              title={`${tournament.organizerName}${tournament.organizerAcademyName ? ` (${tournament.organizerAcademyName})` : ''}`}
            >
              {tournament.organizerName}
              {tournament.organizerAcademyName ? ` (${tournament.organizerAcademyName})` : ''}
            </span>
          </span>
        </p>
      </div>

      <div className={styles.date}>
        <div className={styles.dateLine}>{range.line}</div>
        {range.year && <div className={styles.dateYear}>{range.year}</div>}
      </div>

      <span className={styles.chevron} aria-hidden="true">
        <Icon name="chevron-right" size={18} />
      </span>
    </Link>
  );
}
