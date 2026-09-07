import type { ProfileDto } from '@nforce/shared';
import { useCallback, useEffect, useState } from 'react';
import { useProfilePageTabs } from '../../../hooks/useProfilePageTabs';
import { api } from '../../../lib/apiClient';
import { errorsFrom } from '../../../lib/forms';
import { US_STATES } from '../../../lib/usStates';
import { PageTabs } from '../ui/PageTabs';
import { Icon } from '../ui/Icon';
import styles from './ProfilePage.module.css';

function sameStateSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((s) => bSet.has(s));
}

export function DashboardProfileAlertsPage() {
  const pageTabs = useProfilePageTabs();
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [value, setValue] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api<{ profile: ProfileDto }>('/api/me/profile');
      setProfile(data.profile);
      setValue(data.profile.notifyPublishStates);
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = profile !== null && !sameStateSet(value, profile.notifyPublishStates);
  const q = query.trim().toLowerCase();
  const filtered = q ? US_STATES.filter((s) => s.toLowerCase().includes(q)) : US_STATES;

  function toggle(state: string) {
    setValue((v) => (v.includes(state) ? v.filter((s) => s !== state) : [...v, state]));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setBanner(null);
    try {
      const data = await api<{ profile: ProfileDto }>('/api/me/notify-publish-states', {
        method: 'PATCH',
        body: { states: value },
      });
      setProfile(data.profile);
      setValue(data.profile.notifyPublishStates);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    } finally {
      setSaving(false);
    }
  }

  if (!profile && !banner) {
    return (
      <div className={styles.page}>
        <PageTabs items={pageTabs} />
        <section className={styles.panel} aria-label="Tournament alerts">
          <p className={styles.deck}>Loading…</p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageTabs items={pageTabs} />
      <section className={styles.panel} aria-label="Tournament alerts">
        <h2 className={styles.h2}>Tournament alerts</h2>
        <p className={`${styles.deck ?? ''} ${styles.wideDeck ?? ''}`}>
          Get notified the moment any organizer publishes a new tournament in a state you pick here.
          This is your own subscription, separate from your home "State" on the Profile tab.
        </p>

        {banner && (
          <p className={styles.avatarError} role="alert">
            {banner}
          </p>
        )}

        <div className={styles.field} style={{ marginTop: 18 }}>
          <span className={styles.label}>States to follow</span>
          {value.length > 0 && (
            <div className={styles.stateChipRow}>
              {value.map((s) => (
                <span className={styles.stateChip} key={s}>
                  {s}
                  <button
                    type="button"
                    className={styles.stateChipRemove}
                    aria-label={`Stop following ${s}`}
                    onClick={() => toggle(s)}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            className={styles.input}
            placeholder="Search states…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search states to follow"
          />
          <div className={styles.stateCheckList}>
            {filtered.length === 0 && <p className={styles.hint}>No states match.</p>}
            {filtered.map((s) => (
              <label key={s} className={styles.stateCheckRow}>
                <input type="checkbox" checked={value.includes(s)} onChange={() => toggle(s)} />
                <span>{s}</span>
              </label>
            ))}
          </div>
          <span className={styles.hint}>
            Leave this empty if you'd rather not get these alerts at all.
          </span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.save ?? ''} ${saved ? (styles.saveDone ?? '') : ''}`}
            onClick={() => void save()}
            disabled={saving || (!dirty && !saved)}
          >
            {saved ? (
              <>
                <Icon name="shield-check" size={16} />
                <span>Saved</span>
              </>
            ) : (
              <span>{saving ? 'Saving…' : 'Save alert states'}</span>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
