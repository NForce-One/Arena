import type { ChildDto, MyRosterInvitationDto, TournamentInvitationDto } from '@nforce/shared';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { api } from '../../../lib/apiClient';
import { errorsFrom } from '../../../lib/forms';
import { Icon } from '../ui/Icon';
import { TeamMonogram } from '../ui/TeamMonogram';
import styles from './ParentPage.module.css';

export function ageChip(child: ChildDto): { label: string; tone: 'minor' | 'adult' } {
  if (!child.isMinor) return { label: '18+', tone: 'adult' };
  return { label: `Age ${child.age}`, tone: 'minor' };
}

function ChildTile({
  child,
  pendingCount,
  index,
}: {
  child: ChildDto;
  pendingCount: number;
  index: number;
}) {
  const chip = ageChip(child);
  const stagger: CSSProperties = { animationDelay: `${60 + index * 40}ms` };
  return (
    <Link to={`/parent/children/${child.id}`} className={styles.childTile} style={stagger}>
      {child.photoUrl ? (
        <img src={child.photoUrl} alt="" className={styles.avatarImg} />
      ) : (
        <TeamMonogram name={child.name} size="lg" />
      )}
      <span className={styles.childTileName}>{child.name}</span>
      <span
        className={`${styles.ageChip} ${chip.tone === 'adult' ? (styles.ageChipAdult ?? '') : ''}`}
      >
        {chip.label}
      </span>
      {}
      <span
        className={styles.childTileBadge}
        style={pendingCount === 0 ? { visibility: 'hidden' } : undefined}
      >
        <Icon name="bell" size={11} />
        <span>
          {pendingCount} pending {pendingCount === 1 ? 'invitation' : 'invitations'}
        </span>
      </span>
    </Link>
  );
}

export function DashboardParentPage() {
  const [children, setChildren] = useState<ChildDto[] | null>(null);
  const [pendingCounts, setPendingCounts] = useState<Map<string, number>>(new Map());
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const childData = await api<{ children: ChildDto[] }>('/api/parent/children');
      setChildren(childData.children);

      const counts = await Promise.all(
        childData.children.map(async (c) => {
          try {
            const [tournaments, roster] = await Promise.all([
              api<{ invitations: TournamentInvitationDto[] }>(
                `/api/parent/children/${c.id}/tournament-invitations`,
              ),
              api<{ invitations: MyRosterInvitationDto[] }>(
                `/api/parent/children/${c.id}/roster-invitations`,
              ),
            ]);
            const count =
              tournaments.invitations.filter((inv) => inv.status === 'invited').length +
              roster.invitations.length;
            return [c.id, count] as const;
          } catch {
            return [c.id, 0] as const;
          }
        }),
      );
      setPendingCounts(new Map(counts));
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="My children">
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>My children</h2>
            <p className={styles.deck}>
              Add a child, register them for tournaments and manage their squad invites, all from
              here.
            </p>
          </div>
        </header>

        {banner && (
          <p className={styles.bannerError} role="alert">
            {banner}
          </p>
        )}

        {children === null && !banner && <p className={styles.deck}>Loading…</p>}

        {children !== null && (
          <div className={styles.rows}>
            <Link to="/parent/children/new" className={styles.addChildTile}>
              <span className={styles.addChildIcon}>
                <Icon name="plus" size={20} />
              </span>
              <span className={styles.addChildLabel}>Add child</span>
            </Link>
            {children.map((c, i) => (
              <ChildTile
                key={c.id}
                child={c}
                pendingCount={pendingCounts.get(c.id) ?? 0}
                index={i}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
