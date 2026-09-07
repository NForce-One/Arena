import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../components/BrandMark';
import { CricketLoader } from '../components/CricketLoader';
import { ThemeToggle } from './landing/components/layout/ThemeToggle';
import { api, ApiError } from '../lib/apiClient';
import styles from './LoginPage.module.css';

type State =
  | { phase: 'confirming' }
  | { phase: 'success' }
  | { phase: 'error'; code: string; message: string };

export function ConfirmEmailChangePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { status, refreshUser } = useAuth();
  const [state, setState] = useState<State>({ phase: 'confirming' });

  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!token) {
      setState({ phase: 'error', code: 'TOKEN_INVALID', message: 'This link is not valid.' });
      return;
    }
    void api('/api/auth/confirm-email-change', { body: { token }, skipAuthRetry: true })
      .then(async () => {
        setState({ phase: 'success' });
        if (status === 'authed') await refreshUser().catch(() => {});
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setState({ phase: 'error', code: err.code, message: err.message });
        } else {
          setState({ phase: 'error', code: 'UNKNOWN', message: 'Something went wrong.' });
        }
      });
  }, [token, status, refreshUser]);

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
          {state.phase === 'confirming' && (
            <>
              <h1 className={styles.headline}>
                Confirming <span className={styles.headlineAccent}>Your Email</span>
              </h1>
              <p className={styles.deck}>This only takes a moment.</p>

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

              <CricketLoader label="Confirming your new email…" size="block" />
            </>
          )}

          {state.phase === 'success' && (
            <>
              <h1 className={styles.headline}>
                Email <span className={styles.headlineAccent}>Updated!</span>
              </h1>
              <p className={styles.deck}>
                Your NForce Arena login email has been switched over. Use the new address next time
                you sign in.
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

              <Link to="/dashboard" className={styles.primary}>
                Continue
              </Link>
            </>
          )}

          {state.phase === 'error' && (
            <>
              <h1 className={styles.headline}>
                Confirmation <span className={styles.headlineAccent}>Problem</span>
              </h1>
              <p className={styles.deck}>{state.message}</p>

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

              {(state.code === 'TOKEN_EXPIRED' || state.code === 'TOKEN_ALREADY_USED') && (
                <p className={styles.deck} style={{ margin: '-8px 0 18px' }}>
                  Need a new link? Go to your Profile page and use “Change email” again.
                </p>
              )}

              <Link to="/dashboard" className={styles.primary}>
                Back to dashboard
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
