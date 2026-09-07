import {
  ROLE_LABELS,
  ROLE_NAMES,
  type AdminUserDto,
  type RoleName,
  type RoleRequestDto,
} from '@nforce/shared';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '../../../auth/AuthContext';
import { api } from '../../../lib/apiClient';
import { wallDateTime } from '../../../lib/calendar';
import { errorsFrom } from '../../../lib/forms';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import styles from './AdminUsersPage.module.css';

type Tab = 'users' | 'role-requests';

const TABS: { id: Tab; label: string }[] = [
  { id: 'users', label: 'Users' },
  { id: 'role-requests', label: 'Role requests' },
];

export function DashboardAdminUsersPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get('tab') === 'role-requests' ? 'role-requests' : 'users',
  );
  const [pillReady, setPillReady] = useState(false);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement | null>());

  useLayoutEffect(() => {
    const el = tabRefs.current.get(tab);
    if (!el) return;
    setPill({ left: el.offsetLeft, width: el.offsetWidth });
    const raf = requestAnimationFrame(() => setPillReady(true));
    return () => cancelAnimationFrame(raf);
  }, [tab]);

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="Users and roles">
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>Users &amp; roles</h2>
            <p className={styles.deck}>
              Role changes take effect on the user&apos;s very next action, with no re-login needed.
            </p>
          </div>
          <div className={styles.tabs} role="tablist" aria-label="Section">
            <span
              className={`${styles.pill ?? ''} ${pillReady ? (styles.pillReady ?? '') : ''}`}
              style={{ transform: `translateX(${pill.left}px)`, width: `${pill.width}px` }}
              aria-hidden="true"
            />
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current.set(t.id, el);
                }}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`${styles.tab ?? ''} ${tab === t.id ? (styles.tabActive ?? '') : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {tab === 'users' ? <UsersPanel /> : <RoleRequestsPanel />}
      </section>
    </div>
  );
}

function UsersPanel() {
  const { user: me, refreshUser } = useAuth();
  const [users, setUsers] = useState<AdminUserDto[] | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{
    userId: string;
    userName: string;
    role: RoleName;
  } | null>(null);
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();

  const load = useCallback(async () => {
    try {
      const data = await api<{ users: AdminUserDto[] }>('/api/admin/users');
      setUsers(data.users);
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function grant(userId: string, role: RoleName) {
    try {
      await api(`/api/admin/users/${userId}/roles`, { body: { role } });
      await load();
      if (userId === me?.id) await refreshUser();
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
  }

  async function doRevoke(userId: string, role: RoleName) {
    try {
      await api(`/api/admin/users/${userId}/roles/${role}`, { method: 'DELETE' });
      await load();
      if (userId === me?.id) await refreshUser();
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
  }

  async function requestVerification(userId: string) {
    setBanner(null);
    setSendingTo(userId);
    try {
      await api(`/api/admin/users/${userId}/resend-verification`, { method: 'POST' });
      setSentTo((prev) => new Set(prev).add(userId));
    } catch (err) {
      setBanner(errorsFrom(err).banner);
      await load();
    } finally {
      setSendingTo(null);
    }
  }

  const visible = useMemo(() => {
    if (!users) return [];
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roles.some((r) => ROLE_LABELS[r].toLowerCase().includes(q)),
    );
  }, [users, q]);

  return (
    <div className={styles.body}>
      {banner && (
        <p className={styles.errorBanner} role="alert">
          {banner}
        </p>
      )}
      {users === null && !banner && <p className={styles.deckLoading}>Loading…</p>}

      {users && users.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon name="users" size={30} />
          </span>
          <h3 className={styles.emptyTitle}>No users yet</h3>
        </div>
      )}

      {users && users.length > 0 && visible.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon name="search" size={30} />
          </span>
          <h3 className={styles.emptyTitle}>No users match &quot;{query.trim()}&quot;</h3>
          <p className={styles.emptyBody}>Try a different name, email or role.</p>
        </div>
      )}

      {users && visible.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Member ID</th>
                <th>Verified</th>
                <th>Roles</th>
                <th>Add role</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u, i) => (
                <tr key={u.id} style={{ animationDelay: `${30 + i * 20}ms` }}>
                  <td>
                    <strong className={styles.strong}>{u.name}</strong>
                    {u.id === me?.id && <span className={styles.muted}> (you)</span>}
                  </td>
                  <td className={styles.muted}>{u.email}</td>
                  <td className={styles.muted}>{u.clubId ?? '-'}</td>
                  <td>
                    {u.verified ? (
                      <span className={styles.verified} title="Verified">
                        <Icon name="shield-check" size={16} />
                      </span>
                    ) : sentTo.has(u.id) ? (
                      <span className={styles.muted}>Sent</span>
                    ) : (
                      <button
                        type="button"
                        className={styles.linkBtn}
                        disabled={sendingTo === u.id}
                        onClick={() => void requestVerification(u.id)}
                      >
                        {sendingTo === u.id ? 'Sending…' : 'Request verification'}
                      </button>
                    )}
                  </td>
                  <td>
                    <span className={styles.chips}>
                      {u.roles.map((r) => {
                        const isOwnAdminRole = r === 'platform_admin' && u.id === me?.id;
                        return (
                          <span key={r} className={styles.chip}>
                            {ROLE_LABELS[r]}
                            <button
                              type="button"
                              className={styles.chipX}
                              title={
                                isOwnAdminRole
                                  ? "You can't remove your own platform admin role"
                                  : `Remove ${ROLE_LABELS[r]}`
                              }
                              aria-label={`Remove ${ROLE_LABELS[r]} from ${u.name}`}
                              disabled={isOwnAdminRole}
                              onClick={() =>
                                setRevokeTarget({ userId: u.id, userName: u.name, role: r })
                              }
                            >
                              <Icon name="x" size={10} />
                            </button>
                          </span>
                        );
                      })}
                    </span>
                  </td>
                  <td>
                    <select
                      className={styles.roleSelect}
                      aria-label={`Add role to ${u.name}`}
                      value=""
                      onChange={(e) => {
                        if (e.target.value) void grant(u.id, e.target.value as RoleName);
                      }}
                    >
                      <option value="">＋ role…</option>
                      {ROLE_NAMES.filter((r) => r !== 'platform_admin' && !u.roles.includes(r)).map(
                        (r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke this role?"
        message={
          revokeTarget
            ? `Remove the ${ROLE_LABELS[revokeTarget.role]} role from ${revokeTarget.userName}? They'll immediately lose access to anything that role gates, on their very next action.`
            : ''
        }
        confirmLabel="Revoke"
        onConfirm={() => {
          if (revokeTarget) void doRevoke(revokeTarget.userId, revokeTarget.role);
          setRevokeTarget(null);
        }}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}

function RoleRequestsPanel() {
  const { refreshUser } = useAuth();
  const [requests, setRequests] = useState<RoleRequestDto[] | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<{
    id: string;
    userName: string;
    role: string;
    decision: 'approve' | 'deny';
  } | null>(null);
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();

  const load = useCallback(async () => {
    try {
      const data = await api<{ requests: RoleRequestDto[] }>('/api/admin/role-requests');
      setRequests(data.requests);
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: 'approve' | 'deny') {
    setBanner(null);
    setDecidingId(id);
    try {
      await api(`/api/admin/role-requests/${id}/${decision}`, { method: 'POST' });
      await load();
      await refreshUser();
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    } finally {
      setDecidingId(null);
    }
  }

  const visible = useMemo(() => {
    if (!requests) return [];
    if (!q) return requests;
    return requests.filter(
      (r) =>
        r.userName.toLowerCase().includes(q) ||
        r.userEmail.toLowerCase().includes(q) ||
        ROLE_LABELS[r.requestedRole].toLowerCase().includes(q),
    );
  }, [requests, q]);

  if (requests === null && !banner) {
    return (
      <div className={styles.body}>
        <p className={styles.deckLoading}>Loading…</p>
      </div>
    );
  }

  return (
    <div className={styles.body}>
      {banner && (
        <p className={styles.errorBanner} role="alert">
          {banner}
        </p>
      )}

      {requests && requests.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon name="shield-check" size={30} />
          </span>
          <h3 className={styles.emptyTitle}>No pending role requests</h3>
          <p className={styles.emptyBody}>
            When a user asks for an extra role at signup, it&apos;ll show up here for approval.
          </p>
        </div>
      )}

      {requests && requests.length > 0 && visible.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon name="search" size={30} />
          </span>
          <h3 className={styles.emptyTitle}>No requests match &quot;{query.trim()}&quot;</h3>
        </div>
      )}

      {requests && visible.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Requested role</th>
                <th>Requested</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.id} style={{ animationDelay: `${30 + i * 20}ms` }}>
                  <td>
                    <strong className={styles.strong}>{r.userName}</strong>
                  </td>
                  <td className={styles.muted}>{r.userEmail}</td>
                  <td>
                    <span className={styles.chip}>{ROLE_LABELS[r.requestedRole]}</span>
                  </td>
                  <td className={styles.muted}>{wallDateTime(r.createdAt)}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        disabled={decidingId === r.id}
                        onClick={() =>
                          setDecisionTarget({
                            id: r.id,
                            userName: r.userName,
                            role: ROLE_LABELS[r.requestedRole],
                            decision: 'approve',
                          })
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className={styles.btnGhost}
                        disabled={decidingId === r.id}
                        onClick={() =>
                          setDecisionTarget({
                            id: r.id,
                            userName: r.userName,
                            role: ROLE_LABELS[r.requestedRole],
                            decision: 'deny',
                          })
                        }
                      >
                        Deny
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={decisionTarget !== null}
        title={
          decisionTarget?.decision === 'approve'
            ? 'Approve this role request?'
            : 'Deny this role request?'
        }
        message={
          decisionTarget
            ? decisionTarget.decision === 'approve'
              ? `Grant ${decisionTarget.userName} the ${decisionTarget.role} role right away?`
              : `Deny ${decisionTarget.userName}'s request for the ${decisionTarget.role} role? They can submit a new request afterward.`
            : ''
        }
        confirmLabel={decisionTarget?.decision === 'approve' ? 'Approve' : 'Deny'}
        onConfirm={() => {
          if (decisionTarget) void decide(decisionTarget.id, decisionTarget.decision);
          setDecisionTarget(null);
        }}
        onCancel={() => setDecisionTarget(null)}
      />
    </div>
  );
}
