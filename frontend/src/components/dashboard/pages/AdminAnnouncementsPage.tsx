import { createAnnouncementSchema, ROLE_LABELS, ROLE_NAMES, type RoleName } from '@nforce/shared';
import { useState, type FormEvent } from 'react';
import { api } from '../../../lib/apiClient';
import { errorsFrom, validateForm, type FieldErrors } from '../../../lib/forms';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import styles from './AdminAnnouncementsPage.module.css';

export function DashboardAdminAnnouncementsPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetRoles, setTargetRoles] = useState<RoleName[]>([]);
  const [fields, setFields] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingPublish, setPendingPublish] = useState<{
    title: string;
    body: string;
    targetRoles: RoleName[];
  } | null>(null);

  function toggleRole(role: RoleName) {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBanner(null);
    setSuccess(null);
    const check = validateForm(createAnnouncementSchema, { title, body, targetRoles });
    if (!check.ok) {
      setFields(check.fields);
      return;
    }
    setFields({});
    setPendingPublish(check.data);
  }

  async function publish() {
    if (!pendingPublish) return;
    setPendingPublish(null);
    setBusy(true);
    try {
      const result = await api<{ id: string; recipients: number }>('/api/admin/announcements', {
        body: pendingPublish,
      });
      setSuccess(
        `Announcement published to ${result.recipients} user${result.recipients === 1 ? '' : 's'}. Each received an in-app notification and an email attempt.`,
      );
      setTitle('');
      setBody('');
      setTargetRoles([]);
    } catch (err) {
      const parsed = errorsFrom(err);
      setFields(parsed.fields);
      setBanner(parsed.banner);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="Post an announcement">
        <header className={styles.header}>
          <h2 className={styles.h2}>Post an announcement</h2>
          <p className={styles.deck}>Goes to every user, or only to users holding a chosen role.</p>
        </header>

        {banner && (
          <p className={styles.errorBanner} role="alert">
            {banner}
          </p>
        )}
        {success && (
          <p className={styles.successBanner} role="status">
            {success}
          </p>
        )}

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <label className={styles.field} htmlFor="ann-title">
            <span className={styles.label}>Title</span>
            <input
              id="ann-title"
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Season registrations open"
              aria-invalid={!!fields['title']}
            />
            {fields['title'] && <span className={styles.fieldError}>{fields['title']}</span>}
          </label>

          <label className={styles.field} htmlFor="ann-body">
            <span className={styles.label}>Message</span>
            <textarea
              id="ann-body"
              className={styles.textarea}
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What should everyone know?"
              aria-invalid={!!fields['body']}
            />
            {fields['body'] && <span className={styles.fieldError}>{fields['body']}</span>}
          </label>

          <div className={styles.field}>
            <span className={styles.label}>Audience</span>
            <div className={styles.roleGrid} role="group" aria-label="Audience roles">
              <button
                type="button"
                className={`${styles.roleToggle} ${
                  targetRoles.length === 0 ? (styles.roleToggleActive ?? '') : ''
                }`}
                aria-pressed={targetRoles.length === 0}
                onClick={() => setTargetRoles([])}
              >
                All users
              </button>
              {ROLE_NAMES.map((r) => {
                const active = targetRoles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    className={`${styles.roleToggle} ${active ? (styles.roleToggleActive ?? '') : ''}`}
                    aria-pressed={active}
                    onClick={() => toggleRole(r)}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                );
              })}
            </div>
            <p className={styles.hint}>
              {targetRoles.length === 0
                ? 'Goes to every user.'
                : `Goes to anyone holding ${targetRoles.length === 1 ? 'this role' : 'any of these roles'}.`}
            </p>
          </div>

          <button type="submit" className={styles.submit} disabled={busy}>
            {busy ? (
              <span>Publishing…</span>
            ) : (
              <>
                <Icon name="mega" size={16} />
                <span>Publish announcement</span>
              </>
            )}
          </button>
        </form>
      </section>
      <ConfirmDialog
        open={pendingPublish !== null}
        title="Publish this announcement?"
        message={
          pendingPublish
            ? `This sends an in-app notification and attempts an email to ${
                pendingPublish.targetRoles.length === 0
                  ? 'every user on the platform'
                  : `every user holding ${pendingPublish.targetRoles.map((r) => ROLE_LABELS[r]).join(', ')}`
              }, right away. This can't be recalled once sent.`
            : ''
        }
        confirmLabel="Publish"
        onConfirm={() => void publish()}
        onCancel={() => setPendingPublish(null)}
      />
    </div>
  );
}
