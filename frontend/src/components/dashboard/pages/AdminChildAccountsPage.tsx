import { inviteChildToClaimSchema, type AdminChildDto } from '@nforce/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/apiClient';
import { errorsFrom, validateForm } from '../../../lib/forms';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { Icon } from '../ui/Icon';
import styles from './AdminUsersPage.module.css';

export function DashboardAdminChildAccountsPage() {
  const [children, setChildren] = useState<AdminChildDto[] | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [justSentTo, setJustSentTo] = useState<Set<string>>(new Set());
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();

  const load = useCallback(async () => {
    try {
      const data = await api<{ children: AdminChildDto[] }>(
        '/api/admin/children/approaching-adulthood',
      );
      setChildren(data.children);
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendInvite(childId: string) {
    setBanner(null);
    setFieldErrors((f) => ({ ...f, [childId]: '' }));
    const parsed = validateForm(inviteChildToClaimSchema, { email: emailDrafts[childId] ?? '' });
    if (!parsed.ok) {
      setFieldErrors((f) => ({
        ...f,
        [childId]: parsed.fields['email'] ?? 'Enter a valid email.',
      }));
      return;
    }
    setSendingTo(childId);
    try {
      await api(`/api/admin/children/${childId}/claim-invite`, { body: parsed.data });
      setJustSentTo((prev) => new Set(prev).add(childId));
      setEmailDrafts((f) => ({ ...f, [childId]: '' }));
      await load();
    } catch (err) {
      const e = errorsFrom(err);
      setFieldErrors((f) => ({ ...f, [childId]: e.fields['email'] ?? '' }));
      setBanner(e.fields['email'] ? null : e.banner);
    } finally {
      setSendingTo(null);
    }
  }

  const visible = useMemo(() => {
    if (!children) return [];
    if (!q) return children;
    return children.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.parentName.toLowerCase().includes(q) ||
        c.parentEmail.toLowerCase().includes(q),
    );
  }, [children, q]);

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="Graduate to independent account">
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>Graduate to independent account</h2>
            <p className={styles.deck}>
              Managed children who are already 18, or within 180 days of it. Sending an invite gives
              them their own login without losing any history. Registrations, teams and results all
              carry over on the same account.
            </p>
          </div>
        </header>

        <div className={styles.body}>
          {banner && (
            <p className={styles.errorBanner} role="alert">
              {banner}
            </p>
          )}
          {children === null && !banner && <p className={styles.deckLoading}>Loading…</p>}

          {children && children.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <Icon name="shield-check" size={30} />
              </span>
              <h3 className={styles.emptyTitle}>Nobody is close to 18 right now</h3>
              <p className={styles.emptyBody}>
                Managed children show up here once they&apos;re within 180 days of turning 18, or
                already past it.
              </p>
            </div>
          )}

          {children && children.length > 0 && visible.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <Icon name="search" size={30} />
              </span>
              <h3 className={styles.emptyTitle}>No one matches &quot;{query.trim()}&quot;</h3>
            </div>
          )}

          {children && visible.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Child</th>
                    <th>Age</th>
                    <th>Parent</th>
                    <th>Status</th>
                    <th>Send invite to</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c, i) => (
                    <tr key={c.id} style={{ animationDelay: `${30 + i * 20}ms` }}>
                      <td>
                        <strong className={styles.strong}>{c.name}</strong>
                      </td>
                      <td className={styles.muted}>{c.isMinor ? `${c.age}` : '18+'}</td>
                      <td className={styles.muted}>
                        {c.parentName}
                        <br />
                        {c.parentEmail}
                      </td>
                      <td className={styles.muted}>
                        {justSentTo.has(c.id) ? (
                          <span>Sent just now</span>
                        ) : c.claimInviteSentAt ? (
                          <span>Invited already, awaiting claim</span>
                        ) : (
                          <span>Not invited yet</span>
                        )}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <input
                            className={styles.roleSelect}
                            type="email"
                            placeholder="child's real email"
                            aria-label={`Email to invite ${c.name} with`}
                            value={emailDrafts[c.id] ?? ''}
                            onChange={(e) =>
                              setEmailDrafts((f) => ({ ...f, [c.id]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            className={styles.btnPrimary}
                            disabled={sendingTo === c.id}
                            onClick={() => void sendInvite(c.id)}
                          >
                            {sendingTo === c.id
                              ? 'Sending…'
                              : c.claimInviteSentAt
                                ? 'Resend'
                                : 'Send invite'}
                          </button>
                        </div>
                        {fieldErrors[c.id] && (
                          <p className={styles.errorBanner} role="alert">
                            {fieldErrors[c.id]}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
