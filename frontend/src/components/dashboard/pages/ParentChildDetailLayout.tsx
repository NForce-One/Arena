import type {
  ChildDto,
  FamilyRegistrationDto,
  MyRosterInvitationDto,
  TournamentInvitationDto,
} from '@nforce/shared';
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES, updateChildSchema } from '@nforce/shared';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { api } from '../../../lib/apiClient';
import { dobMonthBounds, isoDateToMonthValue, monthValueToISODate } from '../../../lib/calendar';
import { errorsFrom, validateForm } from '../../../lib/forms';
import { MonthYearField } from '../../MonthYearField';
import { CricketLoader } from '../../CricketLoader';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import { PageTabs, type PageTabItem } from '../ui/PageTabs';
import { TeamMonogram } from '../ui/TeamMonogram';
import { ageChip } from './ParentPage';
import styles from './ParentPage.module.css';

export type PendingChildInvitation =
  | { kind: 'tournament'; id: string; tournamentId: string; label: string; sub: string }
  | { kind: 'roster'; id: string; label: string; sub: string };

export interface ParentChildOutletContext {
  child: ChildDto;
  pendingInvitations: PendingChildInvitation[];
  invitationError: string | null;
  invitationBusy: string | null;
  onRespondInvitation: (invitation: PendingChildInvitation, decision: 'accept' | 'decline') => void;
  activeRegistrations: FamilyRegistrationDto[];
  rowError: string | null;
  onWithdraw: (reg: FamilyRegistrationDto) => void;
}

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

export function DashboardParentChildDetailLayout() {
  const { id } = useParams<{ id: string }>();

  const [child, setChild] = useState<ChildDto | null>(null);
  const [registrations, setRegistrations] = useState<FamilyRegistrationDto[]>([]);
  const [tournamentInvitations, setTournamentInvitations] = useState<TournamentInvitationDto[]>([]);
  const [rosterInvitations, setRosterInvitations] = useState<MyRosterInvitationDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [childData, regData, tournamentData, rosterData] = await Promise.all([
        api<{ children: ChildDto[] }>('/api/parent/children'),
        api<{ registrations: FamilyRegistrationDto[] }>('/api/parent/registrations'),
        api<{ invitations: TournamentInvitationDto[] }>(
          `/api/parent/children/${id}/tournament-invitations`,
        ),
        api<{ invitations: MyRosterInvitationDto[] }>(
          `/api/parent/children/${id}/roster-invitations`,
        ),
      ]);
      const found = childData.children.find((c) => c.id === id) ?? null;
      setChild(found);
      setRegistrations(regData.registrations.filter((r) => r.childId === id));
      setTournamentInvitations(tournamentData.invitations);
      setRosterInvitations(rosterData.invitations);
    } catch (err) {
      setLoadError(errorsFrom(err).banner ?? 'Could not load this child.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dobBounds = dobMonthBounds();

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [withdrawTarget, setWithdrawTarget] = useState<FamilyRegistrationDto | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [invitationBusy, setInvitationBusy] = useState<string | null>(null);
  const [pendingInvitationDecision, setPendingInvitationDecision] = useState<{
    invitation: PendingChildInvitation;
    decision: 'accept' | 'decline';
  } | null>(null);

  const pendingInvitations: PendingChildInvitation[] = [
    ...tournamentInvitations
      .filter((inv) => inv.status === 'invited')
      .map((inv): PendingChildInvitation => ({
        kind: 'tournament',
        id: inv.id,
        tournamentId: inv.tournamentId,
        label: inv.tournamentName,
        sub: inv.ageGroupLabel,
      })),
    ...rosterInvitations.map((inv): PendingChildInvitation => ({
      kind: 'roster',
      id: inv.teamId,
      label: inv.teamName,
      sub: inv.roleInTeam === 'captain' ? 'Captain' : 'Player',
    })),
  ];

  async function respondToInvitation(
    invitation: PendingChildInvitation,
    decision: 'accept' | 'decline',
  ) {
    if (!child) return;
    setPendingInvitationDecision(null);
    setInvitationError(null);
    setInvitationBusy(invitation.id);
    try {
      const path =
        invitation.kind === 'tournament'
          ? `/api/parent/children/${child.id}/tournament-invitations/${invitation.id}/respond`
          : `/api/parent/children/${child.id}/teams/${invitation.id}/roster/respond`;
      await api(path, { body: { decision } });
      await load();
    } catch (err) {
      setInvitationError(errorsFrom(err).banner);
    } finally {
      setInvitationBusy(null);
    }
  }

  function openEdit() {
    if (!child) return;
    setName(child.name);
    setDob(isoDateToMonthValue(child.dateOfBirth));
    setEditError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!child) return;
    setEditError(null);
    const parsed = validateForm(updateChildSchema, {
      name,
      dateOfBirth: dob ? monthValueToISODate(dob) : '',
    });
    if (!parsed.ok) {
      setEditError(Object.values(parsed.fields)[0] ?? 'Invalid input');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/parent/children/${child.id}`, { method: 'PATCH', body: parsed.data });
      setEditing(false);
      await load();
    } catch (err) {
      setEditError(errorsFrom(err).banner);
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    if (!child) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
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
      await api(`/api/parent/children/${child.id}/photo`, {
        method: 'PUT',
        body: { contentType: file.type, data },
      });
      await load();
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removePhoto() {
    if (!child) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      await api(`/api/parent/children/${child.id}/photo`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not remove the photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function withdraw(reg: FamilyRegistrationDto) {
    setRowError(null);
    try {
      await api(`/api/registrations/${reg.registrationId}/withdraw`, { method: 'POST' });
      await load();
    } catch (err) {
      setRowError(errorsFrom(err).banner);
    } finally {
      setWithdrawTarget(null);
    }
  }

  if (loadError) {
    return (
      <div className={styles.page}>
        <section className={styles.panel} aria-label="Child">
          <p className={styles.bannerError} role="alert">
            {loadError}
          </p>
          <Link to="/parent" className={styles.editToggle}>
            <Icon name="arrow-right" size={13} />
            <span>Back to My Children</span>
          </Link>
        </section>
      </div>
    );
  }

  if (!child) {
    return (
      <div className={styles.page}>
        <CricketLoader label="Loading child…" />
      </div>
    );
  }

  const chip = ageChip(child);
  const activeRegistrations = registrations.filter((r) => r.status === 'active');

  const tabs: PageTabItem[] = [
    {
      to: `/parent/children/${child.id}`,
      label: 'Pending Invitations',
      end: true,
      count: pendingInvitations.length,
    },
    { to: `/parent/children/${child.id}/registrations`, label: 'Active Registrations' },
    { to: `/parent/children/${child.id}/fixtures`, label: 'Fixtures' },
  ];

  const context: ParentChildOutletContext = {
    child,
    pendingInvitations,
    invitationError,
    invitationBusy,
    onRespondInvitation: (invitation, decision) =>
      setPendingInvitationDecision({ invitation, decision }),
    activeRegistrations,
    rowError,
    onWithdraw: setWithdrawTarget,
  };

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label={child.name}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>{child.name}</h2>
            <p className={styles.deck}>
              Manage {child.name}'s profile, invitations and tournament registrations.
            </p>
          </div>
          <Link to="/parent" className={styles.editToggle}>
            <Icon name="arrow-right" size={13} />
            <span>Back to My Children</span>
          </Link>
        </header>

        <article className={styles.childCard}>
          <header className={styles.childHead}>
            <div className={styles.childHeadLeft}>
              {child.photoUrl ? (
                <img src={child.photoUrl} alt="" className={styles.avatarImg} />
              ) : (
                <TeamMonogram name={child.name} size="lg" />
              )}
              {editing ? (
                <div className={styles.editRow}>
                  <input
                    aria-label="Child's name"
                    className={styles.editInput}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={50}
                    autoFocus
                  />
                  <MonthYearField
                    value={dob}
                    onChange={setDob}
                    placeholder="Select month and year"
                    ariaLabel="Date of birth"
                    min={dobBounds.min}
                    max={dobBounds.max}
                  />
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={() => void saveEdit()}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setEditing(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className={styles.childHeadText}>
                  <h3 className={styles.childName}>{child.name}</h3>
                  {child.clubId && <p className={styles.childClubId}>Member ID: {child.clubId}</p>}
                  <div className={styles.childMeta}>
                    <span
                      className={`${styles.ageChip} ${chip.tone === 'adult' ? (styles.ageChipAdult ?? '') : ''}`}
                    >
                      {chip.label}
                    </span>
                    <Link to={`/players/${child.id}`} className={styles.profileLink}>
                      View public profile
                    </Link>
                    <Link
                      to={`/parent/children/${child.id}/cricket-profile`}
                      className={styles.profileLink}
                    >
                      {child.consentConfirmed ? 'Edit cricket profile' : 'Complete cricket profile'}
                    </Link>
                    {child.consentConfirmed ? (
                      <span className={styles.cricketChip}>
                        <Icon name="shield-check" size={12} />
                        <span>
                          {child.jerseyNumber != null ? `#${child.jerseyNumber} · ` : ''}
                          Consent confirmed
                        </span>
                      </span>
                    ) : (
                      <span className={`${styles.cricketChip} ${styles.cricketChipWarn}`}>
                        Cricket profile incomplete
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {!editing && (
              <button type="button" className={styles.editToggle} onClick={openEdit}>
                <Icon name="gear" size={13} />
                <span>Edit</span>
              </button>
            )}
          </header>

          {editing && editError && (
            <p className={styles.bannerError} role="alert">
              {editError}
            </p>
          )}

          {!child.isMinor && (
            <p className={styles.adultNotice}>
              <Icon name="shield-check" size={14} />
              <span>
                {child.name} is now 18. New registrations, withdrawals and squad responses on their
                behalf are no longer allowed.
              </span>
            </p>
          )}

          <div className={styles.photoRow}>
            {photoError && (
              <p className={styles.bannerError} role="alert">
                {photoError}
              </p>
            )}
            <label className={styles.uploadLabel}>
              <input
                ref={fileRef}
                type="file"
                accept={ALLOWED_PHOTO_TYPES.join(',')}
                className={styles.fileInput}
                disabled={photoBusy}
                onChange={(e) => void handleFile(e)}
              />
              <Icon name="arrow-right" size={13} />
              <span>
                {photoBusy ? 'Uploading…' : child.photoUrl ? 'Change photo' : 'Add photo'}
              </span>
            </label>
            {child.photoUrl && (
              <button
                type="button"
                className={styles.removePhotoBtn}
                disabled={photoBusy}
                onClick={() => void removePhoto()}
              >
                Remove photo
              </button>
            )}
          </div>
        </article>

        <PageTabs items={tabs} />
        <Outlet context={context} />
      </section>

      <ConfirmDialog
        open={withdrawTarget !== null}
        title="Withdraw registration?"
        message={
          withdrawTarget
            ? `Withdraw ${child.name} from ${withdrawTarget.tournamentName}? They can register again later if space remains.`
            : ''
        }
        confirmLabel="Withdraw"
        onConfirm={() => withdrawTarget && void withdraw(withdrawTarget)}
        onCancel={() => setWithdrawTarget(null)}
      />

      <ConfirmDialog
        open={pendingInvitationDecision !== null}
        title={
          pendingInvitationDecision?.decision === 'accept'
            ? 'Accept this invitation?'
            : 'Decline this invitation?'
        }
        message={
          pendingInvitationDecision
            ? pendingInvitationDecision.decision === 'accept'
              ? `Accept the invitation to ${pendingInvitationDecision.invitation.label} on behalf of ${child.name}?`
              : `Decline the invitation to ${pendingInvitationDecision.invitation.label} for ${child.name}? Whoever sent it will need to send a new one if you change your mind.`
            : ''
        }
        confirmLabel={pendingInvitationDecision?.decision === 'accept' ? 'Accept' : 'Decline'}
        onConfirm={() =>
          pendingInvitationDecision &&
          void respondToInvitation(
            pendingInvitationDecision.invitation,
            pendingInvitationDecision.decision,
          )
        }
        onCancel={() => setPendingInvitationDecision(null)}
      />
    </div>
  );
}
