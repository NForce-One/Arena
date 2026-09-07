import type { ContactMessageDto } from '@nforce/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/apiClient';
import { errorsFrom } from '../../../lib/forms';
import { Icon } from '../ui/Icon';
import styles from './AdminContactPage.module.css';

function statusClass(status: ContactMessageDto['status']): string {
  return status === 'resolved' ? (styles.statusResolved ?? '') : (styles.statusOpen ?? '');
}

export function DashboardAdminContactPage() {
  const [messages, setMessages] = useState<ContactMessageDto[] | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ messages: ContactMessageDto[] }>('/api/admin/contact-messages');
      setMessages(data.messages);
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string) {
    setBanner(null);
    setResolvingId(id);
    try {
      await api(`/api/admin/contact-messages/${id}/resolve`, { method: 'POST' });
      await load();
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    } finally {
      setResolvingId(null);
    }
  }

  const openCount = (messages ?? []).filter((m) => m.status === 'open').length;

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="Contact requests">
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>Contact requests</h2>
            <p className={styles.deck}>
              Messages sent directly to the platform admins.
              {openCount > 0 && ` ${openCount} open.`}
            </p>
          </div>
        </header>

        {banner && (
          <p className={styles.errorBanner} role="alert">
            {banner}
          </p>
        )}
        {!banner && messages === null && <p className={styles.deckLoading}>Loading…</p>}

        {messages !== null && messages.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Icon name="envelope" size={30} />
            </span>
            <h3 className={styles.emptyTitle}>No messages yet</h3>
          </div>
        )}

        {messages !== null && messages.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Subject</th>
                  <th>From</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m, i) => (
                  <tr key={m.id} style={{ animationDelay: `${25 + i * 16}ms` }}>
                    <td className={styles.when}>{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className={styles.subject}>{m.subject}</div>
                      <div className={styles.messageBody}>{m.message}</div>
                    </td>
                    <td className={styles.who}>
                      <div>{m.userName}</div>
                      <div className={styles.muted}>{m.userEmail}</div>
                    </td>
                    <td>
                      <span className={`${styles.statusChip} ${statusClass(m.status)}`}>
                        {m.status}
                      </span>
                    </td>
                    <td>
                      {m.status === 'open' && (
                        <button
                          type="button"
                          className={styles.resolveBtn}
                          disabled={resolvingId === m.id}
                          onClick={() => void resolve(m.id)}
                        >
                          <Icon name="shield-check" size={13} />
                          <span>{resolvingId === m.id ? 'Resolving…' : 'Mark resolved'}</span>
                        </button>
                      )}
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
