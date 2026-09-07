import type { PlayerInningsScoreDto, PublicFixtureDto } from '@nforce/shared';
import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import { TeamMonogram } from './TeamMonogram';
import styles from './FixtureRow.module.css';

interface Props {
  fixture: PublicFixtureDto;
  tournamentName: string;
  perspective?: string | null;
  index?: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function formatTime(d: Date) {
  const hours = d.getUTCHours();
  const mins = d.getUTCMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${h12}:${mins.toString().padStart(2, '0')} ${period}`;
}

function formatDateShort(d: Date) {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function formatDateFull(d: Date) {
  return `${WEEKDAYS_FULL[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function formatWeekday(d: Date) {
  return WEEKDAYS[d.getUTCDay()];
}

function ScorecardSide({
  teamName,
  scores,
}: {
  teamName: string;
  scores: PlayerInningsScoreDto[];
}) {
  return (
    <div className={styles.scorecardSide}>
      <div className={styles.scorecardTeam}>{teamName}</div>
      <table className={styles.scorecardTable}>
        <thead>
          <tr>
            <th>Player</th>
            <th>Runs</th>
            <th>Wickets</th>
          </tr>
        </thead>
        <tbody>
          {scores.length > 0 ? (
            scores.map((p) => (
              <tr key={p.userId}>
                <td className={styles.scorecardPlayer} title={p.playerName}>
                  {p.playerName}
                </td>
                <td className={styles.scorecardNum}>{p.runs}</td>
                <td className={styles.scorecardNum}>{p.wickets}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td className={styles.scorecardPlayer}>-</td>
              <td className={styles.scorecardNum}>-</td>
              <td className={styles.scorecardNum}>-</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function FixtureRow({ fixture, tournamentName, perspective, index = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const start = new Date(fixture.startsAt);
  const end = new Date(start.getTime() + fixture.durationMinutes * 60000);
  const stagger: CSSProperties = { animationDelay: `${60 + index * 40}ms` };
  const isPast = !!fixture.result;
  const ground = fixture.ground || 'No ground assigned';

  let outcome: 'W' | 'L' | 'T' | null = null;
  if (isPast && perspective) {
    if (!fixture.result?.winnerTeam) outcome = 'T';
    else outcome = fixture.result.winnerTeam === perspective ? 'W' : 'L';
  }

  function toggle() {
    setExpanded((v) => !v);
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  }

  return (
    <article
      className={`${styles.card ?? ''} ${isPast ? (styles.past ?? '') : ''}`}
      style={stagger}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${fixture.homeTeam} versus ${fixture.awayTeam}, ${isPast ? 'played' : 'upcoming'}, ${expanded ? 'showing full details' : 'view full details'}`}
      onClick={toggle}
      onKeyDown={onKeyDown}
    >
      <div className={styles.faceTop}>
        <div className={styles.dateChip}>
          <span className={styles.dateChipDay}>{formatDateShort(start)}</span>
          <span className={styles.dateChipDot} aria-hidden="true">
            ·
          </span>
          <span className={styles.dateChipTime}>{formatTime(start)}</span>
        </div>
        <span className={styles.tourn} title={tournamentName}>
          {tournamentName}
        </span>
      </div>

      <div className={styles.teams}>
        <div className={styles.team}>
          <TeamMonogram name={fixture.homeTeam} size="md" />
          <span className={styles.teamName} title={fixture.homeTeam}>
            {fixture.homeTeam}
          </span>
        </div>
        <span className={styles.vs} aria-hidden="true">
          vs
        </span>
        <div className={styles.team}>
          <TeamMonogram name={fixture.awayTeam} size="md" />
          <span className={styles.teamName} title={fixture.awayTeam}>
            {fixture.awayTeam}
          </span>
        </div>
      </div>

      <div className={styles.groundLine}>
        <Icon name="map-pin" size={13} />
        <span title={ground}>{ground}</span>
      </div>

      {isPast && fixture.result && (
        <div className={styles.result}>
          <div className={styles.resultCopy}>
            <div className={styles.scoreRow}>
              <span className={styles.scoreTeam} title={fixture.homeTeam}>
                {fixture.homeTeam}
              </span>
              <span className={styles.scoreValue}>{fixture.result.homeScore}</span>
            </div>
            <div className={styles.scoreRow}>
              <span className={styles.scoreTeam} title={fixture.awayTeam}>
                {fixture.awayTeam}
              </span>
              <span className={styles.scoreValue}>{fixture.result.awayScore}</span>
            </div>
          </div>
          <div className={styles.resultRight}>
            {outcome && (
              <span className={`${styles.outcome ?? ''} ${styles[`outcome_${outcome}`] ?? ''}`}>
                {outcome}
              </span>
            )}
            <div
              className={styles.resultLine}
              title={fixture.result.winnerTeam ? `${fixture.result.winnerTeam} won` : 'Match drawn'}
            >
              {fixture.result.winnerTeam ? `${fixture.result.winnerTeam} won` : 'Match drawn'}
            </div>
          </div>
        </div>
      )}

      <span className={styles.expandHint}>
        <span>{expanded ? 'Hide full details' : 'View full details'}</span>
        <Icon
          name="chevron-down"
          size={13}
          style={{
            transform: expanded ? 'rotate(180deg)' : undefined,
            transition: 'transform 180ms ease',
          }}
        />
      </span>

      {expanded && (
        <div className={styles.detailPanel}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Kickoff</span>
            <span className={styles.detailValue}>
              {formatDateFull(start)} · {formatTime(start)} – {formatTime(end)}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Ground</span>
            <span className={styles.detailValue}>{ground}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Tournament</span>
            <span className={styles.detailValue}>{tournamentName}</span>
          </div>
          {!isPast && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Status</span>
              <span className={styles.detailValue}>Upcoming, {formatWeekday(start)}</span>
            </div>
          )}
          {isPast && fixture.result && (
            <div className={styles.scorecard}>
              <ScorecardSide teamName={fixture.homeTeam} scores={fixture.result.homePlayerScores} />
              <ScorecardSide teamName={fixture.awayTeam} scores={fixture.result.awayPlayerScores} />
            </div>
          )}
        </div>
      )}
    </article>
  );
}
