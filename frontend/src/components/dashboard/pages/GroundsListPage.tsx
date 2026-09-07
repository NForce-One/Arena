import type { GroundDto } from '@nforce/shared';
import { useMemo, type CSSProperties } from 'react';
import { Link, useOutletContext } from 'react-router';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { Icon } from '../ui/Icon';
import type { GroundsOutletContext } from './GroundsLayout';
import styles from './GroundsPage.module.css';

function GroundTile({ ground, index }: { ground: GroundDto; index: number }) {
  const stagger: CSSProperties = { animationDelay: `${40 + index * 40}ms` };
  const windowCount = ground.availabilityRules.length;
  return (
    <Link to={`/grounds/${ground.id}`} className={styles.groundTile} style={stagger}>
      <h3 className={styles.groundTileName}>{ground.name}</h3>
      <span className={styles.metaItem}>
        <Icon name="map-pin" size={14} />
        <span className={styles.groundTileLocation}>{ground.location}</span>
      </span>
      <div className={styles.groundTileStats}>
        {ground.capacity != null && (
          <span className={styles.metaItem}>
            <Icon name="users" size={14} />
            {ground.capacity}
          </span>
        )}
        <span className={styles.groundTileChip}>
          {ground.facilities.length} {ground.facilities.length === 1 ? 'facility' : 'facilities'}
        </span>
        <span className={styles.groundTileChip}>
          {windowCount} {windowCount === 1 ? 'window' : 'windows'}
        </span>
      </div>
    </Link>
  );
}

export function DashboardGroundsListPage() {
  const { grounds, groundsBanner } = useOutletContext<GroundsOutletContext>();
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();

  const visibleGrounds = useMemo(() => {
    if (!grounds) return [];
    if (!q) return grounds;
    return grounds.filter(
      (g) => g.name.toLowerCase().includes(q) || g.location.toLowerCase().includes(q),
    );
  }, [grounds, q]);

  return (
    <section className={styles.panel} aria-label="My grounds">
      <header className={styles.header}>
        <div className={styles.headText}>
          <h2 className={styles.h2}>My grounds</h2>
          <p className={styles.deck}>{grounds ? `${grounds.length} listed` : 'Loading…'}</p>
        </div>
      </header>

      {groundsBanner && <p className={styles.actionError}>{groundsBanner}</p>}

      {grounds === null && !groundsBanner && <p className={styles.deck}>Loading…</p>}

      {grounds !== null &&
        (visibleGrounds.length > 0 ? (
          <div className={styles.groundList}>
            {visibleGrounds.map((g, i) => (
              <GroundTile key={g.id} ground={g} index={i} />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Icon name="map-pin" size={30} />
            </span>
            <h3 className={styles.emptyTitle}>
              {q ? `No grounds match "${query.trim()}"` : 'No grounds listed yet'}
            </h3>
            <p className={styles.emptyBody}>
              {q
                ? 'Try a different name or location.'
                : 'Add your first ground and organizers will be able to request it.'}
            </p>
          </div>
        ))}
    </section>
  );
}
