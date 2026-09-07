import {
  battingStyleLabel,
  bowlingStyleLabel,
  GENDER_LABELS,
  HEIGHT_UNIT_LABELS,
  JERSEY_SIZE_LABELS,
  PLAYING_ROLE_LABELS,
  WEIGHT_UNIT_LABELS,
  type OrganizerPlayerProfileDto,
} from '@nforce/shared';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { api, ApiError } from '../../../lib/apiClient';
import { Icon } from './Icon';
import styles from './PlayerContactProfileModal.module.css';

function jerseyDetail(player: OrganizerPlayerProfileDto): string {
  const parts: string[] = [];
  if (player.jerseyNumber != null) parts.push(`#${player.jerseyNumber}`);
  if (player.jerseyName) parts.push(`"${player.jerseyName}"`);
  const bits = parts.join(' ');
  const size = player.jerseySize ? JERSEY_SIZE_LABELS[player.jerseySize] : null;
  if (bits && size) return `${bits} · ${size}`;
  return bits || size || '';
}

export interface PlayerContactProfileModalProps {
  tournamentId: string | null;
  userId: string | null;
  onClose(): void;
}

export function PlayerContactProfileModal({
  tournamentId,
  userId,
  onClose,
}: PlayerContactProfileModalProps) {
  const [profile, setProfile] = useState<OrganizerPlayerProfileDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = tournamentId !== null && userId !== null;

  useEffect(() => {
    if (!open) return;
    setProfile(null);
    setError(null);
    void api<{ profile: OrganizerPlayerProfileDto }>(
      `/api/tournaments/${tournamentId}/players/${userId}/contact-profile`,
    )
      .then((data) => setProfile(data.profile))
      .catch((err: unknown) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'This player is not currently registered in this tournament.'
            : 'Could not load this profile.',
        ),
      );
  }, [open, tournamentId, userId]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const initial = profile?.name.slice(0, 1).toUpperCase() ?? '';
  const details = profile
    ? [
        { label: 'Jersey', value: jerseyDetail(profile) },
        { label: 'School', value: profile.school ?? '' },
        {
          label: 'Batting',
          value: battingStyleLabel(profile.battingStyle, profile.battingStyleOther),
        },
        {
          label: 'Bowling',
          value: bowlingStyleLabel(profile.bowlingStyle, profile.bowlingStyleOther),
        },
        {
          label: 'Role',
          value: profile.playingRole ? PLAYING_ROLE_LABELS[profile.playingRole] : '',
        },
        {
          label: 'Height',
          value:
            profile.heightValue != null && profile.heightUnit
              ? `${profile.heightValue} ${HEIGHT_UNIT_LABELS[profile.heightUnit]}`
              : '',
        },
        {
          label: 'Weight',
          value:
            profile.weightValue != null && profile.weightUnit
              ? `${profile.weightValue} ${WEIGHT_UNIT_LABELS[profile.weightUnit]}`
              : '',
        },
        { label: 'Gender', value: profile.gender ? GENDER_LABELS[profile.gender] : '' },
      ].filter((d) => d.value)
    : [];

  return createPortal(
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={profile ? `${profile.name}'s profile` : 'Player profile'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" ref={closeRef} className={styles.closeBtn} onClick={onClose}>
          <Icon name="x" size={16} />
          <span className={styles.srOnly}>Close</span>
        </button>

        {error && (
          <div className={styles.stateBlock}>
            <p className={styles.errorText} role="alert">
              {error}
            </p>
          </div>
        )}

        {!error && !profile && (
          <div className={styles.stateBlock}>
            <p className={styles.deck}>Loading…</p>
          </div>
        )}

        {!error && profile && (
          <>
            <header className={styles.header}>
              <span className={styles.avatarDisc} aria-hidden="true">
                {profile.photoUrl ? (
                  <img src={profile.photoUrl} alt="" className={styles.avatarImg} />
                ) : (
                  <span className={styles.avatarInitial}>{initial}</span>
                )}
              </span>
              <div>
                <h2 className={styles.h2}>{profile.name}</h2>
                <p className={styles.deck}>Visible only to this tournament&apos;s organizer.</p>
              </div>
            </header>

            <div className={styles.contactBlock}>
              <h3 className={styles.sectionLabel}>Contact</h3>
              <dl className={styles.detailsGrid}>
                <div className={styles.detailItem}>
                  <dt className={styles.detailLabel}>Phone</dt>
                  <dd className={styles.detailValue}>{profile.phone ?? 'Not provided'}</dd>
                </div>
                <div className={styles.detailItem}>
                  <dt className={styles.detailLabel}>Emergency contact</dt>
                  <dd className={styles.detailValue}>
                    {profile.emergencyContactName
                      ? `${profile.emergencyContactName}${
                          profile.emergencyContactPhone ? ` (${profile.emergencyContactPhone})` : ''
                        }`
                      : 'Not provided'}
                  </dd>
                </div>
              </dl>
            </div>

            {(details.length > 0 || profile.consentConfirmed) && (
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
                {profile.consentConfirmed && (
                  <span className={styles.consentBadge}>
                    <Icon name="shield-check" size={13} />
                    <span>
                      Consent confirmed{profile.consentDate ? ` · ${profile.consentDate}` : ''}
                    </span>
                  </span>
                )}
              </div>
            )}

            {profile.tournaments.length === 0 ? (
              <p className={styles.deck}>
                This player hasn&apos;t taken part in any tournaments yet.
              </p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tournament</th>
                      <th>Team</th>
                      <th className={styles.num}>Played</th>
                      <th className={styles.num}>Won</th>
                      <th className={styles.num}>Lost</th>
                      <th className={styles.num}>Runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.tournaments.map((t) => (
                      <tr key={`${t.tournamentId}-${t.teamName}`}>
                        <td>
                          <Link
                            to={`/tournaments/${t.tournamentId}`}
                            className={styles.tournamentLink}
                          >
                            {t.tournamentName}
                          </Link>
                        </td>
                        <td>{t.teamName}</td>
                        <td className={styles.num}>{t.played}</td>
                        <td className={styles.num}>{t.won}</td>
                        <td className={styles.num}>{t.lost}</td>
                        <td className={styles.num}>{t.runsScored}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
