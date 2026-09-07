import {
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  requestEmailChangeSchema,
  updateProfileSchema,
  type ProfileDto,
} from '@nforce/shared';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../../auth/AuthContext';
import { useProfilePageTabs } from '../../../hooks/useProfilePageTabs';
import { api } from '../../../lib/apiClient';
import { dobMonthBounds, isoDateToMonthValue, monthValueToISODate } from '../../../lib/calendar';
import { errorsFrom, validateForm, type FieldErrors } from '../../../lib/forms';
import { MonthYearField } from '../../MonthYearField';
import { StateField } from '../../StateField';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import { PageTabs } from '../ui/PageTabs';
import styles from './ProfilePage.module.css';

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function DashboardProfilePage() {
  const { user, refreshUser } = useAuth();
  const pageTabs = useProfilePageTabs();
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [academyName, setAcademyName] = useState('');
  const [state, setState] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSaved, setPhotoSaved] = useState(false);
  const [parentBusy, setParentBusy] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);
  const [playerBusy, setPlayerBusy] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [emailChangeBusy, setEmailChangeBusy] = useState(false);
  const [emailChangeFields, setEmailChangeFields] = useState<FieldErrors>({});
  const [emailChangeBanner, setEmailChangeBanner] = useState<string | null>(null);
  const [emailChangeSent, setEmailChangeSent] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm(): void;
  } | null>(null);
  const dobBounds = dobMonthBounds();
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ profile: ProfileDto }>('/api/me/profile');
      setProfile(data.profile);
      setName(data.profile.name);
      setDob(data.profile.dateOfBirth ? isoDateToMonthValue(data.profile.dateOfBirth) : '');
      setAcademyName(data.profile.academyName ?? '');
      setState(data.profile.state ?? '');
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const profileDobMonth = profile?.dateOfBirth ? isoDateToMonthValue(profile.dateOfBirth) : '';
  const dirty =
    profile !== null &&
    (name !== profile.name ||
      dob !== profileDobMonth ||
      academyName !== (profile.academyName ?? '') ||
      state !== (profile.state ?? ''));
  const showAcademyField =
    user?.roles.some((r) => r === 'organizer' || r === 'team_manager') ?? false;

  async function save() {
    setBanner(null);
    setSaved(false);
    const parsed = validateForm(updateProfileSchema, {
      name,
      dateOfBirth: dob ? monthValueToISODate(dob) : '',
      academyName: academyName.trim() || null,
      state: state.trim() || null,
    });
    if (!parsed.ok) {
      setFields(parsed.fields);
      return;
    }
    setFields({});
    try {
      const data = await api<{ profile: ProfileDto }>('/api/me/profile', {
        method: 'PATCH',
        body: parsed.data,
      });
      setProfile(data.profile);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
      await refreshUser();
    } catch (err) {
      const e = errorsFrom(err);
      setFields(e.fields);
      setBanner(e.banner);
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoSaved(false);
    if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setPhotoError('Use JPEG, PNG or WebP.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(`Max size is ${Math.floor(MAX_PHOTO_BYTES / (1024 * 1024))} MB.`);
      return;
    }
    setPhotoBusy(true);
    try {
      const data = await readAsBase64(file);
      const res = await api<{ profile: ProfileDto }>('/api/me/photo', {
        method: 'PUT',
        body: { contentType: file.type, data },
      });
      setProfile(res.profile);
      setPhotoSaved(true);
      window.setTimeout(() => setPhotoSaved(false), 2200);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function doBecomeParent() {
    setParentError(null);
    setParentBusy(true);
    try {
      await api('/api/me/become-parent', { method: 'POST' });
      await refreshUser();
    } catch (err) {
      setParentError(errorsFrom(err).banner);
    } finally {
      setParentBusy(false);
    }
  }

  function becomeParent() {
    setPendingConfirm({
      title: 'Enroll as a Parent?',
      message: 'This adds the Parent role to your account so you can add and manage children.',
      confirmLabel: 'Enroll as a Parent',
      onConfirm: () => void doBecomeParent(),
    });
  }

  async function doBecomePlayer() {
    setPlayerError(null);
    setPlayerBusy(true);
    try {
      await api('/api/me/become-player', { method: 'POST' });
      await refreshUser();
    } catch (err) {
      setPlayerError(errorsFrom(err).banner);
    } finally {
      setPlayerBusy(false);
    }
  }

  function becomePlayer() {
    setPendingConfirm({
      title: 'Become a Player?',
      message: 'This adds the Player role to your account so you can register for tournaments.',
      confirmLabel: 'Become a Player',
      onConfirm: () => void doBecomePlayer(),
    });
  }

  async function requestEmailChange() {
    setEmailChangeFields({});
    setEmailChangeBanner(null);
    setEmailChangeSent(false);
    const parsed = validateForm(requestEmailChangeSchema, { newEmail, password: currentPassword });
    if (!parsed.ok) {
      setEmailChangeFields(parsed.fields);
      return;
    }
    setEmailChangeBusy(true);
    try {
      await api('/api/me/email/change', { method: 'POST', body: parsed.data });
      setEmailChangeSent(true);
      setNewEmail('');
      setCurrentPassword('');
    } catch (err) {
      const e = errorsFrom(err);
      setEmailChangeFields(e.fields);
      setEmailChangeBanner(e.banner);
    } finally {
      setEmailChangeBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const res = await api<{ profile: ProfileDto }>('/api/me/photo', { method: 'DELETE' });
      setProfile(res.profile);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not remove the photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  if (!profile && !banner) {
    return (
      <div className={styles.page}>
        <PageTabs items={pageTabs} />
        <section className={styles.panel} aria-label="My profile">
          <p className={styles.deck}>Loading…</p>
        </section>
      </div>
    );
  }

  const initial = profile?.name.slice(0, 1).toUpperCase() ?? '?';

  return (
    <div className={styles.page}>
      <PageTabs items={pageTabs} />
      <section className={styles.panel} aria-label="My profile">
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>My profile</h2>
            <p className={styles.deck}>Edit your details. Changes apply immediately.</p>
          </div>
          <div className={styles.headerActions}>
            {user && !user.roles.includes('player') && (
              <button
                type="button"
                className={styles.publicLink}
                onClick={() => becomePlayer()}
                disabled={playerBusy}
              >
                <Icon name="person" size={14} />
                <span>{playerBusy ? 'Enabling…' : 'Become a Player'}</span>
              </button>
            )}
            {user && !user.roles.includes('parent') && (
              <button
                type="button"
                className={styles.publicLink}
                onClick={() => becomeParent()}
                disabled={parentBusy}
              >
                <Icon name="users" size={14} />
                <span>{parentBusy ? 'Enabling…' : 'Enroll as a Parent'}</span>
              </button>
            )}
            {user && user.roles.includes('player') && (
              <Link to={`/players/${user.id}`} className={styles.publicLink}>
                <Icon name="arrow-right" size={14} />
                <span>View my public profile & stats</span>
              </Link>
            )}
            {user && user.roles.includes('player') && (
              <Link to="/profile/cricket" className={styles.publicLink}>
                <Icon name="shirt" size={14} />
                <span>
                  {profile?.consentConfirmed
                    ? 'Edit cricket profile'
                    : 'Complete your cricket profile'}
                </span>
              </Link>
            )}
          </div>
        </header>
        {playerError && (
          <p className={styles.avatarError} role="alert">
            {playerError}
          </p>
        )}
        {parentError && (
          <p className={styles.avatarError} role="alert">
            {parentError}
          </p>
        )}

        {banner && (
          <p className={styles.avatarError} role="alert">
            {banner}
          </p>
        )}

        {profile && (
          <>
            <div className={styles.avatarBlock}>
              <span className={styles.avatarDisc} aria-hidden="true">
                {profile.photoUrl ? (
                  <img src={profile.photoUrl} alt="" className={styles.avatarImg} />
                ) : (
                  <span className={styles.avatarInitial}>{initial}</span>
                )}
              </span>

              <div className={styles.avatarBody}>
                <div className={styles.fileRow}>
                  <span className={profile.photoUrl ? styles.fileName : styles.filePlaceholder}>
                    {profile.photoUrl ? 'Photo set' : 'No file chosen'}
                  </span>
                  {profile.photoUrl && (
                    <button
                      type="button"
                      className={styles.clear}
                      disabled={photoBusy}
                      onClick={() => void removePhoto()}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p
                  className={
                    photoError
                      ? styles.avatarError
                      : photoSaved
                        ? styles.avatarSaved
                        : styles.avatarHint
                  }
                >
                  {photoError ??
                    (photoSaved ? (
                      <>
                        <Icon name="shield-check" size={13} />
                        <span>Photo updated</span>
                      </>
                    ) : (
                      `JPEG, PNG or WebP, up to ${Math.floor(MAX_PHOTO_BYTES / (1024 * 1024))} MB.`
                    ))}
                </p>
              </div>

              <label className={styles.upload}>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ALLOWED_PHOTO_TYPES.join(',')}
                  className={styles.fileInput}
                  disabled={photoBusy}
                  onChange={(e) => void handleFile(e)}
                />
                <Icon name="arrow-right" size={14} />
                <span>{photoBusy ? 'Uploading…' : 'Choose photo'}</span>
              </label>
            </div>

            <div className={styles.divider} role="presentation" />

            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={styles.label}>Name</span>
                <input
                  type="text"
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  spellCheck={false}
                  maxLength={50}
                  aria-invalid={!!fields['name']}
                />
                {fields['name'] && <span className={styles.avatarError}>{fields['name']}</span>}
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Date of birth</span>
                <MonthYearField
                  value={dob}
                  onChange={setDob}
                  placeholder="Select month and year"
                  min={dobBounds.min}
                  max={dobBounds.max}
                  clearable
                  ariaLabel="Date of birth"
                />
                {fields['dateOfBirth'] && (
                  <span className={styles.avatarError}>{fields['dateOfBirth']}</span>
                )}
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Email</span>
                <input
                  type="email"
                  className={styles.input}
                  value={profile.email}
                  readOnly
                  disabled
                />
                {!emailChangeOpen && (
                  <button
                    type="button"
                    className={styles.publicLink}
                    onClick={() => {
                      setEmailChangeOpen(true);
                      setEmailChangeSent(false);
                      setEmailChangeFields({});
                      setEmailChangeBanner(null);
                    }}
                  >
                    <Icon name="envelope" size={14} />
                    <span>Change email</span>
                  </button>
                )}
              </label>

              {emailChangeOpen && (
                <div className={styles.field}>
                  {emailChangeSent ? (
                    <p className={styles.hint}>
                      Check the new address for a confirmation link. Nothing changes until you click
                      it.
                    </p>
                  ) : (
                    <>
                      <span className={styles.label}>New email</span>
                      <input
                        type="email"
                        className={styles.input}
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                      {emailChangeFields['newEmail'] && (
                        <span className={styles.avatarError}>{emailChangeFields['newEmail']}</span>
                      )}
                      <span className={styles.label} style={{ marginTop: 10 }}>
                        Current password
                      </span>
                      <input
                        type="password"
                        className={styles.input}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Confirm it's you"
                        autoComplete="current-password"
                      />
                      {emailChangeFields['password'] && (
                        <span className={styles.avatarError}>{emailChangeFields['password']}</span>
                      )}
                      {emailChangeBanner && (
                        <span className={styles.avatarError}>{emailChangeBanner}</span>
                      )}
                      <div className={styles.actions} style={{ marginTop: 10 }}>
                        <button
                          type="button"
                          className={styles.save ?? ''}
                          onClick={() => void requestEmailChange()}
                          disabled={emailChangeBusy}
                        >
                          <span>{emailChangeBusy ? 'Sending…' : 'Send confirmation link'}</span>
                        </button>
                        <button
                          type="button"
                          className={styles.publicLink}
                          onClick={() => setEmailChangeOpen(false)}
                        >
                          <span>Cancel</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {profile.clubId && (
                <label className={styles.field}>
                  <span className={styles.label}>Member ID</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={profile.clubId}
                    readOnly
                    disabled
                  />
                  <span className={styles.hint}>
                    Your permanent NForce Arena member id. Visible only to you and admins.
                  </span>
                </label>
              )}

              <label className={styles.field}>
                <span className={styles.label}>State</span>
                <StateField value={state} onChange={setState} ariaLabel="State" />
                <span className={styles.hint}>
                  Lets an organizer notify players and team managers in your state about a new
                  tournament.
                </span>
                {fields['state'] && <span className={styles.avatarError}>{fields['state']}</span>}
              </label>

              {showAcademyField && (
                <label className={styles.field}>
                  <span className={styles.label}>Academy name</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={academyName}
                    onChange={(e) => setAcademyName(e.target.value)}
                    placeholder="e.g. Falcon Cricket Academy"
                    maxLength={80}
                  />
                  <span className={styles.hint}>
                    Shown publicly next to your name, on the tournament page if you organize, or in
                    the organizer's Registrations tab if you manage a team.
                  </span>
                  {fields['academyName'] && (
                    <span className={styles.avatarError}>{fields['academyName']}</span>
                  )}
                </label>
              )}
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.save ?? ''} ${saved ? (styles.saveDone ?? '') : ''}`}
                onClick={() => void save()}
                disabled={!dirty && !saved}
              >
                {saved ? (
                  <>
                    <Icon name="shield-check" size={16} />
                    <span>Saved</span>
                  </>
                ) : (
                  <span>Save changes</span>
                )}
              </button>
              <p className={styles.actionsHint}>
                Your photo saves the moment you choose it, above. This button saves the fields below
                it instead.
              </p>
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? ''}
        confirmLabel={pendingConfirm?.confirmLabel}
        onConfirm={() => {
          pendingConfirm?.onConfirm();
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
