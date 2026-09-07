import type { RequestableRole, RoleRequestDto } from '@nforce/shared';
import { REQUESTABLE_ROLES, ROLE_LABELS } from '@nforce/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { api } from '../../../lib/apiClient';
import { errorsFrom } from '../../../lib/forms';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon, type IconName } from '../ui/Icon';
import styles from './RequestRolePage.module.css';

const ROLE_ICON: Record<RequestableRole, IconName> = {
  organizer: 'clipboard',
  team_manager: 'users',
  ground_owner: 'map-pin',
  umpire: 'shield-check',
};

function statusClass(status: RoleRequestDto['status']): string {
  if (status === 'approved') return styles.statusApproved ?? '';
  if (status === 'denied') return styles.statusDenied ?? '';
  return styles.statusPending ?? '';
}

export function DashboardRequestRolePage() {
  const { user, refreshUser } = useAuth();
  const [requests, setRequests] = useState<RoleRequestDto[] | null>(null);
  const [selected, setSelected] = useState<RequestableRole | ''>('');
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ requests: RoleRequestDto[] }>('/api/me/role-requests');
      setRequests(data.requests);
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const heldRoles = new Set(user?.roles ?? []);
  const pending = (requests ?? []).find((r) => r.status === 'pending');
  const history = (requests ?? []).filter((r) => r.status !== 'pending');
  const available = REQUESTABLE_ROLES.filter((r) => !heldRoles.has(r));

  async function submit() {
    if (!selected) return;
    setBanner(null);
    setSubmitting(true);
    try {
      await api('/api/me/role-requests', { body: { role: selected } });
      setSelected('');
      await load();
      await refreshUser();
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="Request a role">
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>Request a role</h2>
            <p className={styles.deck}>
              Ask to become an Organizer, Team Manager, Ground Owner or Umpire. A platform admin
              reviews every request before it's granted.
            </p>
          </div>
        </header>

        {banner && (
          <p className={styles.bannerError} role="alert">
            {banner}
          </p>
        )}

        {requests === null && !banner && <p className={styles.deck}>Loading…</p>}

        {requests !== null && pending && (
          <div className={styles.pendingCard}>
            <Icon name="shield-check" size={20} />
            <div>
              <h3 className={styles.pendingTitle}>Pending: {ROLE_LABELS[pending.requestedRole]}</h3>
              <p className={styles.pendingBody}>
                Submitted {new Date(pending.createdAt).toLocaleDateString()}. An admin will review
                this soon. You can't submit another request until this one is decided.
              </p>
            </div>
          </div>
        )}

        {requests !== null && !pending && (
          <>
            {available.length === 0 ? (
              <p className={styles.deck}>You already hold every requestable role.</p>
            ) : (
              <div className={styles.form}>
                <div className={styles.roleGrid} role="radiogroup" aria-label="Role to request">
                  {available.map((role) => {
                    const isSelected = selected === role;
                    return (
                      <button
                        key={role}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`${styles.roleTile} ${isSelected ? styles.roleTileActive : ''}`}
                        onClick={() => setSelected(role)}
                      >
                        <Icon name={ROLE_ICON[role]} size={20} />
                        <span>{ROLE_LABELS[role]}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className={styles.submitBtn}
                  disabled={!selected || submitting}
                  onClick={() => setConfirming(true)}
                >
                  {submitting ? 'Submitting…' : 'Submit request'}
                </button>
              </div>
            )}
          </>
        )}

        {history.length > 0 && (
          <div className={styles.historySection}>
            <h4 className={styles.subHead}>
              <Icon name="clipboard" size={14} />
              <span>Past requests</span>
            </h4>
            <div className={styles.historyList}>
              {history.map((r) => (
                <div className={styles.historyRow} key={r.id}>
                  <span className={styles.historyRole}>{ROLE_LABELS[r.requestedRole]}</span>
                  <span className={`${styles.statusChip} ${statusClass(r.status)}`}>
                    {r.status}
                  </span>
                  <span className={styles.historyDate}>
                    {new Date(r.decidedAt ?? r.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirming}
        title="Submit this role request?"
        message={
          selected
            ? `Request the ${ROLE_LABELS[selected]} role? You won't be able to submit another request until a platform admin decides this one.`
            : ''
        }
        confirmLabel="Submit request"
        onConfirm={() => {
          setConfirming(false);
          void submit();
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
