import { forgotPasswordSchema } from '@nforce/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '../components/BrandMark';
import { CricketLoader } from '../components/CricketLoader';
import { ThemeToggle } from './landing/components/layout/ThemeToggle';
import { api } from '../lib/apiClient';
import { errorsFrom, validateForm, type FieldErrors } from '../lib/forms';
import styles from './LoginPage.module.css';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBanner(null);
    const check = validateForm(forgotPasswordSchema, { email });
    if (!check.ok) {
      setFields(check.fields);
      return;
    }
    setFields({});
    setBusy(true);
    try {
      await api('/api/auth/forgot-password', { body: check.data, skipAuthRetry: true });
      setSent(true);
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
          {sent ? (
            <>
              <h1 className={styles.headline}>
                Check <span className={styles.headlineAccent}>your email</span>
              </h1>
              <p className={styles.deck}>
                If an account exists for that address, a reset link is on its way. The link is valid
                for 60 minutes.
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
                Back to login
              </Link>
            </>
          ) : (
            <>
              <h1 className={styles.headline}>
                Forgot <span className={styles.headlineAccent}>Password?</span>
              </h1>
              <p className={styles.deck}>
                Enter your email and we&apos;ll send you a link to reset it.
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

              {banner && (
                <p className={styles.formError} role="alert">
                  {banner}
                </p>
              )}

              <form onSubmit={(e) => void onSubmit(e)} noValidate>
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
                    />
                  </span>
                  {fields['email'] && <span className={styles.fieldError}>{fields['email']}</span>}
                </label>

                <button type="submit" className={styles.primary} disabled={busy}>
                  {busy ? <CricketLoader label="Sending reset link…" /> : 'Send reset link'}
                </button>
              </form>

              <p className={styles.signupPrompt}>
                <Link to="/login">Back to login</Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
