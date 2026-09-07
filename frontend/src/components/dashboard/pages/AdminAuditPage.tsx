import type { AuditEntryDto } from '@nforce/shared';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/apiClient';
import { absoluteTime, describeAudit, isSecurityAction, relativeTime } from '../../../lib/audit';
import { errorsFrom } from '../../../lib/forms';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { Icon } from '../ui/Icon';
import styles from './AdminAuditPage.module.css';

export function DashboardAdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntryDto[] | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();

  useEffect(() => {
    void api<{ entries: AuditEntryDto[] }>('/api/admin/audit')
      .then((data) => setEntries(data.entries))
      .catch((err: unknown) => setBanner(errorsFrom(err).banner));
  }, []);

  const decorated = useMemo(
    () => (entries ?? []).map((e) => ({ entry: e, ...describeAudit(e) })),
    [entries],
  );

  const visible = useMemo(() => {
    if (!q) return decorated;
    return decorated.filter(
      ({ entry, summary, detail }) =>
        summary.toLowerCase().includes(q) ||
        (detail ?? '').toLowerCase().includes(q) ||
        (entry.actorName ?? '').toLowerCase().includes(q) ||
        (entry.entityLabel ?? '').toLowerCase().includes(q),
    );
  }, [decorated, q]);

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="Audit trail">
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>Audit trail</h2>
            <p className={styles.deck}>
              Destructive and security-sensitive actions, recorded in the same transaction as the
              action itself.
            </p>
          </div>
        </header>

        {banner && (
          <p className={styles.errorBanner} role="alert">
            {banner}
          </p>
        )}
        {!banner && entries === null && <p className={styles.deckLoading}>Loading…</p>}

        {entries !== null && entries.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Icon name="clipboard" size={30} />
            </span>
            <h3 className={styles.emptyTitle}>No audit entries yet</h3>
          </div>
        )}

        {entries !== null && entries.length > 0 && visible.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Icon name="search" size={30} />
            </span>
            <h3 className={styles.emptyTitle}>No entries match &quot;{query.trim()}&quot;</h3>
          </div>
        )}

        {entries !== null && visible.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={`${styles.table} table-mobile`}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>What happened</th>
                  <th>Who</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ entry, summary, detail }, i) => (
                  <tr key={entry.id} style={{ animationDelay: `${25 + i * 16}ms` }}>
                    <td data-label="When">
                      {}
                      <div className={styles.when}>{relativeTime(entry.createdAt)}</div>
                      <div className={styles.whenAbs}>{absoluteTime(entry.createdAt)}</div>
                    </td>
                    <td data-label="What happened">
                      <div className={styles.what}>
                        {isSecurityAction(entry.action) && (
                          <span className={styles.securityFlag}>Security</span>
                        )}
                        <span>{summary}</span>
                      </div>
                      {detail && <div className={styles.detail}>{detail}</div>}
                    </td>
                    <td data-label="Who" className={styles.who}>
                      {entry.actorName ?? <span className={styles.muted}>System</span>}
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
