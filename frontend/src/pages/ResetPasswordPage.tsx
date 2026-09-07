import { resetPasswordSchema } from '@nforce/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../components/BrandMark';
import { CricketLoader } from '../components/CricketLoader';
import { PasswordStrength } from '../components/PasswordStrength';
import { ThemeToggle } from './landing/components/layout/ThemeToggle';
import { api } from '../lib/apiClient';
import { errorsFrom, validateForm, type FieldErrors } from '../lib/forms';
import styles from './LoginPage.module.css';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { status, logout } = useAuth();

  useEffect(() => {
    if (status === 'authed') void logout();
  }, [status, logout]);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBanner(null);
    const check = validateForm(resetPasswordSchema, { token, password });
    if (!check.ok) {
      setBanner(check.fields['token'] ?? null);
      setFields(check.fields);
      return;
    }
    setFields({});
    setBusy(true);
    try {
      await api('/api/auth/reset-password', { body: check.data, skipAuthRetry: true });
      setDone(true);
    } catch (err) {
      const parsed = errorsFrom(err);
      setFields(parsed.fields);
      setBanner(parsed.banner);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <main className={styles.stage}>
        <div className={styles.photo}>
          <img src="/assets/hero-day-3.png" alt="" data-hero="light" />
          <img src="/assets/hero-night-3.png" alt="" data-hero="dark" />
        </div>

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

        <div className={styles.card}>
          {done ? (
            <>
              <h1 className={styles.headline}>
                Password <span className={styles.headlineAccent}>Changed</span>
              </h1>
              <p className={styles.deck}>
                You&apos;ve been signed out everywhere. Log in with your new password.
              </p>

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

              <Link to="/login" className={styles.primary}>
                Go to login
              </Link>
            </>
          ) : (
            <>
              <h1 className={styles.headline}>
                Choose a <span className={styles.headlineAccent}>New Password</span>
              </h1>
              <p className={styles.deck}>Pick something you haven&apos;t used before.</p>

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
                <>
                  <p className={styles.formError} role="alert">
                    {banner}
                  </p>
                  <p className={styles.deck} style={{ margin: '-8px 0 18px' }}>
                    Link problems?{' '}
                    <Link to="/forgot-password" style={{ color: 'var(--red)' }}>
                      Request a fresh reset link
                    </Link>
                    .
                  </p>
                </>
              )}

              <form onSubmit={(e) => void onSubmit(e)} noValidate>
                <label className={styles.label}>
                  New Password
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
                      placeholder="Choose a strong password"
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
                  {fields['password'] && (
                    <span className={styles.fieldError}>{fields['password']}</span>
                  )}
                  <PasswordStrength value={password} />
                </label>

                <button type="submit" className={styles.primary} disabled={busy}>
                  {busy ? <CricketLoader label="Saving your new password…" /> : 'Set new password'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
