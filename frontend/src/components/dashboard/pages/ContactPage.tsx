import { contactMessageSchema } from '@nforce/shared';
import { useState } from 'react';
import { api } from '../../../lib/apiClient';
import { errorsFrom, validateForm, type FieldErrors } from '../../../lib/forms';
import { Icon } from '../ui/Icon';
import styles from './ContactPage.module.css';

export function DashboardContactPage() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setBanner(null);
    setSent(false);
    const parsed = validateForm(contactMessageSchema, { subject, message });
    if (!parsed.ok) {
      setFields(parsed.fields);
      return;
    }
    setFields({});
    setSending(true);
    try {
      await api('/api/contact', { body: parsed.data });
      setSubject('');
      setMessage('');
      setSent(true);
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="Contact an admin">
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>Contact an admin</h2>
            <p className={styles.deck}>
              Have an issue or a question? Send a message straight to the platform admins.
            </p>
          </div>
        </header>

        {sent && (
          <p className={styles.successNote}>
            <Icon name="shield-check" size={15} />
            <span>Message sent. An admin will get back to you.</span>
          </p>
        )}
        {banner && (
          <p className={styles.bannerError} role="alert">
            {banner}
          </p>
        )}

        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>Subject</span>
            <input
              className={styles.input}
              placeholder="Short summary of your issue"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-invalid={!!fields['subject']}
            />
            {fields['subject'] && <span className={styles.fieldError}>{fields['subject']}</span>}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Message</span>
            <textarea
              className={styles.textarea}
              placeholder="Describe what's going on…"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-invalid={!!fields['message']}
            />
            {fields['message'] && <span className={styles.fieldError}>{fields['message']}</span>}
          </label>

          <button
            type="button"
            className={styles.submitBtn}
            disabled={sending}
            onClick={() => void submit()}
          >
            {sending ? 'Sending…' : 'Send message'}
          </button>
        </div>
      </section>
    </div>
  );
}
