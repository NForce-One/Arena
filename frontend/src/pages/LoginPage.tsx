import { loginSchema } from '@nforce/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../components/BrandMark';
import { MatchLoader } from '../components/MatchLoader';
import { ThemeToggle } from './landing/components/layout/ThemeToggle';
import { errorsFrom, validateForm, type FieldErrors } from '../lib/forms';
import { withMinDuration } from '../lib/timing';
import styles from './LoginPage.module.css';

const LOGIN_SCENE_MS = 2400;

const LANDING_PAGE = '/tournaments';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBanner(null);
    const check = validateForm(loginSchema, { email, password });
    if (!check.ok) {
      setFields(check.fields);
      return;
    }
    setFields({});
    setBusy(true);
    try {
      await withMinDuration(login(check.data), LOGIN_SCENE_MS);
      navigate(LANDING_PAGE, { replace: true });
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
        {busy && <MatchLoader caption="Signing you in…" />}
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

        <form className={styles.card} onSubmit={(e) => void onSubmit(e)} noValidate>
          <h1 className={styles.headline}>
            Welcome <span className={styles.headlineAccent}>Back!</span>
          </h1>
          <p className={styles.deck}>Log in to continue to your NForce Arena account</p>

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
                placeholder="Enter your password"
                autoComplete="current-password"
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
          </label>

          <Link to="/forgot-password" className={styles.forgot}>
            Forgot Password?
          </Link>

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
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
            </svg>
            {busy ? 'Signing in…' : 'Login'}
          </button>

          <p className={styles.signupPrompt}>
            Don&apos;t have an account? <Link to="/signup">Sign up</Link>
          </p>

          <p className={styles.assurance}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5l-8-3z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            Secure login. Your data is protected with us.
          </p>
        </form>
      </main>
    </div>
  );
}
