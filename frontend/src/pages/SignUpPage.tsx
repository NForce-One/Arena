import {
  REQUESTABLE_ROLES,
  ROLE_LABELS,
  signupSchema,
  type ExternalInvitePreviewDto,
  type RequestableRole,
} from '@nforce/shared';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BrandMark } from '../components/BrandMark';
import { CricketLoader } from '../components/CricketLoader';
import { LegalModal, type LegalDoc } from '../components/LegalModal';
import { MatchLoader } from '../components/MatchLoader';
import { MonthYearField } from '../components/MonthYearField';
import { PasswordStrength } from '../components/PasswordStrength';
import { ThemeToggle } from './landing/components/layout/ThemeToggle';
import { api } from '../lib/apiClient';
import { monthValueToISODate, signupDobMonthBounds } from '../lib/calendar';
import { errorsFrom, validateForm, type FieldErrors } from '../lib/forms';
import { withMinDuration } from '../lib/timing';
import styles from './SignUpPage.module.css';

const SIGNUP_SCENE_MS = 2200;

type RoleKey = '' | RequestableRole | 'parent';

interface RoleOption {
  key: RoleKey;
  label: string;
  icon: ReactNode;
}

const ROLES: RoleOption[] = [
  {
    key: '',
    label: 'Player',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="7" r="4" />
        <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
      </svg>
    ),
  },
  {
    key: 'team_manager',
    label: 'Manager',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M3 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
        <path d="M14 21v-1a5 5 0 0 1 5-5h.5" />
      </svg>
    ),
  },
  {
    key: 'organizer',
    label: 'Organizer',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
        <path d="m9 15 2 2 4-4" />
      </svg>
    ),
  },
  {
    key: 'ground_owner',
    label: 'Ground Owner',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 21h18" />
        <path d="M4 21V10l8-6 8 6v11" />
        <path d="M10 21v-6h4v6" />
      </svg>
    ),
  },
  {
    key: 'umpire',
    label: 'Umpire',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3v18" />
        <path d="M5 6h14l-2 6 2 6H5l2-6-2-6z" />
      </svg>
    ),
  },
  {
    key: 'parent',
    label: 'Parent',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="7" r="3.2" />
        <path d="M2.5 20c.7-3.4 3-5.2 5.5-5.2s4.8 1.8 5.5 5.2" />
        <circle cx="17.5" cy="10.5" r="2.2" />
        <path d="M14.3 20c.5-2.6 1.8-4 3.2-4s2.7 1.4 3.2 4" />
      </svg>
    ),
  },
];

void (REQUESTABLE_ROLES satisfies readonly RequestableRole[]);

export function SignUpPage() {
  const [params] = useSearchParams();
  const inviteToken = params.get('inviteToken');
  const [invitePreview, setInvitePreview] = useState<ExternalInvitePreviewDto | null | undefined>(
    inviteToken ? undefined : null,
  );
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    api<{ preview: ExternalInvitePreviewDto }>(
      `/api/external-invites/by-token/${encodeURIComponent(inviteToken)}`,
    )
      .then(({ preview }) => {
        if (!cancelled) setInvitePreview(preview);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setInviteError(errorsFrom(err).banner ?? 'This invite link is not valid.');
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const [role, setRole] = useState<RoleKey>('');
  const approvalLabel = role !== '' && role !== 'parent' ? ROLE_LABELS[role] : undefined;
  const noteKind: 'approval' | 'parent' | null =
    role === 'parent' ? 'parent' : approvalLabel ? 'approval' : null;
  const lastNoteRef = useRef<{ kind: 'approval' | 'parent'; label?: string } | null>(null);
  if (noteKind) lastNoteRef.current = { kind: noteKind, label: approvalLabel };
  const displayNote = noteKind ? { kind: noteKind, label: approvalLabel } : lastNoteRef.current;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [agree, setAgree] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const dobBounds = signupDobMonthBounds();

  useEffect(() => {
    if (invitePreview) setEmail(invitePreview.email);
  }, [invitePreview]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBanner(null);
    const check = validateForm(signupSchema, {
      name,
      email,
      password,
      dateOfBirth: dateOfBirth ? monthValueToISODate(dateOfBirth) : undefined,
      requestedRole: !invitePreview && role !== '' && role !== 'parent' ? role : undefined,
      parentOnly: !invitePreview && role === 'parent' ? true : undefined,
      inviteToken: invitePreview ? (inviteToken ?? undefined) : undefined,
    });
    setFields(check.ok ? {} : check.fields);
    if (!ageConfirmed) {
      setBanner('Please confirm you are 18 years of age or older to continue.');
      return;
    }
    if (!agree) {
      setBanner('Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    if (!check.ok) return;
    setBusy(true);
    try {
      await withMinDuration(
        api('/api/auth/signup', { body: check.data, skipAuthRetry: true }),
        SIGNUP_SCENE_MS,
      );
      setDone(true);
    } catch (err) {
      const parsed = errorsFrom(err);
      setFields(parsed.fields);
      setBanner(parsed.banner);
    } finally {
      setBusy(false);
    }
  }

  const Topbar = (
    <header className={styles.topbar}>
      <Link to="/" className={styles.brand} aria-label="NForce Arena home">
        <BrandMark size={42} />
        <span className={styles.brandText}>
          NForce <b>Arena</b>
          <span className={styles.brandTag}>HOST. COMPETE. WIN.</span>
        </span>
      </Link>
      <ThemeToggle />
    </header>
  );

  const Photo = (
    <div className={styles.photo}>
      <img src="/assets/hero-day-3.png" alt="" data-hero="light" />
      <img src="/assets/hero-night-3.png" alt="" data-hero="dark" />
    </div>
  );

  if (done) {
    return (
      <div className="shell">
        <main className={styles.stage}>
          {Photo}
          {Topbar}
          <div className={styles.card}>
            <h1 className={styles.headline}>
              Check your <span className={styles.headlineAccent}>email</span>
            </h1>
            <p className={styles.deck}>
              Your account was created. We sent a verification link to <strong>{email}</strong>.
              Click it to verify your account.
            </p>
            {!invitePreview && role !== '' && role !== 'parent' && (
              <p className={styles.hint}>
                …and we&apos;ll email you once an admin reviews your{' '}
                <strong>{ROLE_LABELS[role]}</strong> request.
              </p>
            )}
            {!invitePreview && role === 'parent' && (
              <p className={styles.hint}>
                Your Parent account is ready. Once verified, add your children from your dashboard
                to start managing their registrations.
              </p>
            )}
            {invitePreview?.role === 'team_manager' && (
              <p className={styles.hint}>
                Your Team Manager account is ready. Once verified, log in and create your team —{' '}
                {invitePreview.organizerName}&apos;s invitation
                {invitePreview.tournamentName ? ` to ${invitePreview.tournamentName}` : ''} will be
                waiting for it.
              </p>
            )}
            {invitePreview?.role === 'player' && (
              <p className={styles.hint}>
                Once verified, log in and check your invitations. {invitePreview.organizerName} is
                waiting for your response{' '}
                {invitePreview.tournamentName ? `to ${invitePreview.tournamentName}` : ''}.
              </p>
            )}
            <Link className={styles.primary} to="/login">
              Go to login
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="shell">
        <main className={styles.stage}>
          {Photo}
          {Topbar}
          <div className={styles.card}>
            <h1 className={styles.headline}>
              Invite link <span className={styles.headlineAccent}>not valid</span>
            </h1>
            <p className={styles.deck}>{inviteError}</p>
            <p className={styles.hint}>
              Ask whoever invited you for a fresh link, or sign up on your own instead.
            </p>
            <Link className={styles.primary} to="/signup">
              Sign up without an invite
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (inviteToken && invitePreview === undefined) {
    return (
      <div className="shell">
        <main className={styles.stage}>
          {Photo}
          {Topbar}
          <div className={styles.card}>
            <CricketLoader label="Loading your invite…" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <main className={styles.stage}>
        {busy && <MatchLoader caption="Creating your account…" />}
        {Photo}
        {Topbar}

        <form className={styles.card} onSubmit={(e) => void onSubmit(e)} noValidate>
          <h1 className={styles.headline}>
            Join the <span className={styles.headlineAccent}>Arena</span>
          </h1>
          <p className={styles.deck}>Create your NForce Arena account in seconds</p>

          <div className={styles.ballDivider} aria-hidden="true">
            <span className={styles.ballLine} />
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="#e11b22" />
              <path
                d="M6 8 Q12 6 18 8 M6 16 Q12 18 18 16"
                stroke="#fff"
                strokeWidth="1.2"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
            <span className={styles.ballLine} />
          </div>

          {banner && (
            <p className={styles.formError} role="alert">
              {banner}
            </p>
          )}

          {invitePreview ? (
            <div className={styles.roleGroup}>
              <p className={styles.roleNote} role="note">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <span>
                  <strong>{invitePreview.organizerName}</strong> invited you to join as a{' '}
                  <strong>
                    {invitePreview.role === 'team_manager' ? 'Team Manager' : 'Player'}
                  </strong>
                  {invitePreview.tournamentName ? ` for ${invitePreview.tournamentName}` : ''}
                  {invitePreview.ageGroupLabel ? ` (${invitePreview.ageGroupLabel})` : ''}. Your
                  email is set from the invite and can&apos;t be changed here.
                </span>
              </p>
            </div>
          ) : (
            <div className={styles.roleGroup} role="radiogroup" aria-label="I am signing up as">
              <span className={styles.roleLabel}>I am signing up as</span>
              <div className={styles.roleGrid}>
                {ROLES.map((r) => {
                  const selected = role === r.key;
                  return (
                    <button
                      key={r.key || 'player'}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`${styles.role} ${selected ? styles.roleActive : ''}`}
                      onClick={() => setRole(r.key)}
                    >
                      {r.icon}
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <div
                className={styles.roleNoteWrap}
                data-open={noteKind ? 'true' : 'false'}
                aria-hidden={!noteKind}
              >
                <div className={styles.roleNoteInner}>
                  {displayNote?.kind === 'approval' && (
                    <p className={styles.roleNote} role="note">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" />
                      </svg>
                      <span>
                        <strong>{displayNote.label}</strong> requires admin approval before you can
                        use those features. You&apos;ll be a player until then; once approved, your
                        account switches to {displayNote.label} instead.
                      </span>
                    </p>
                  )}
                  {displayNote?.kind === 'parent' && (
                    <p className={styles.roleNote} role="note">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" />
                      </svg>
                      <span>
                        <strong>Parent</strong>: instant, no approval needed. This creates a
                        parent-only account for managing your children&apos;s registrations, not a
                        player account for yourself. You can add player access for yourself later
                        from your profile if you also want to play.
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <label className={styles.label}>
            Name
            <span className={styles.field}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              <input
                className={styles.input}
                placeholder="Your full name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                aria-invalid={!!fields['name']}
              />
            </span>
            {fields['name'] && <span className={styles.fieldError}>{fields['name']}</span>}
          </label>

          <label className={styles.label}>
            Email Address
            <span className={styles.field}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
              <input
                type="email"
                className={styles.input}
                placeholder="Enter your email address"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.trimStart())}
                aria-invalid={!!fields['email']}
                readOnly={!!invitePreview}
                disabled={!!invitePreview}
              />
            </span>
            {fields['email'] && <span className={styles.fieldError}>{fields['email']}</span>}
          </label>

          <label className={styles.label}>
            Password
            <span className={styles.field}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <input
                type={showPassword ? 'text' : 'password'}
                className={styles.input}
                placeholder="Create a password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!fields['password']}
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 5.06-6.06" />
                    <path d="M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 11 8 11 8a19.7 19.7 0 0 1-2.4 3.51" />
                    <path d="M1 1l22 22" />
                    <path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </span>
            {fields['password'] && <span className={styles.fieldError}>{fields['password']}</span>}
            <PasswordStrength value={password} />
          </label>

          <label className={styles.label}>
            Date of Birth
            <MonthYearField
              value={dateOfBirth}
              onChange={setDateOfBirth}
              placeholder="Select month and year"
              min={dobBounds.min}
              max={dobBounds.max}
              ariaLabel="Date of birth"
            />
            {fields['dateOfBirth'] ? (
              <span className={styles.fieldError}>{fields['dateOfBirth']}</span>
            ) : (
              <span className={styles.hint}>
                Only needed if you plan to register for age-restricted tournaments.
              </span>
            )}
          </label>

          <label className={styles.terms}>
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
            />
            <span>I confirm that I am 18 years of age or older.</span>
          </label>

          <label className={styles.terms}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              I agree to the{' '}
              <button
                type="button"
                className={styles.legalLink}
                onClick={() => setLegalDoc('terms')}
              >
                Terms of Service
              </button>{' '}
              and{' '}
              <button
                type="button"
                className={styles.legalLink}
                onClick={() => setLegalDoc('privacy')}
              >
                Privacy Policy
              </button>
              .
            </span>
          </label>

          <button type="submit" className={styles.primary} disabled={busy}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6M22 11h-6" />
            </svg>
            {busy ? 'Creating account…' : 'Create Account'}
          </button>

          <p className={styles.footNote}>
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </form>
      </main>

      <LegalModal open={legalDoc} onClose={() => setLegalDoc(null)} onNavigate={setLegalDoc} />
    </div>
  );
}
