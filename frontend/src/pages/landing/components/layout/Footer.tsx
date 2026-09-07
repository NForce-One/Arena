import type { MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import styles from './Footer.module.css';

export function Footer() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isHome = pathname === '/';

  function scrollToSection(e: MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    if (isHome) {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${id}`);
    } else {
      navigate(`/#${id}`);
    }
  }

  return (
    <footer className={styles.site}>
      <div className={`${styles.top} bleed`}>
        <div className={styles.brandCol}>
          <Link to="/" className={styles.brand} aria-label="NForce Arena home">
            <svg width="42" height="48" viewBox="0 0 44 50" fill="none" aria-hidden="true">
              <path
                d="M2 4 L22 1 L42 4 V27 C42 39 33 45.5 22 49 C11 45.5 2 39 2 27 Z"
                fill="rgba(0,0,0,0.35)"
                stroke="#ffffff"
                strokeWidth="2.4"
              />
              <path d="M13 34 L28 14" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" />
              <path
                d="M27 12.5 L31.5 16.5"
                stroke="#ffffff"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <circle cx="14.5" cy="17" r="3" fill="#ffffff" />
              <path d="M20 36 L26 36" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <span className={styles.brandText}>
              <span className={styles.brandName}>
                NForce <b>Arena</b>
              </span>
              <span className={styles.brandTag}>HOST. COMPETE. WIN.</span>
            </span>
          </Link>
          <p className={styles.blurb}>
            The all-in-one platform for cricket organizers, teams, umpires and ground owners:
            fixtures, bookings, results, all in one place.
          </p>
        </div>

        <div>
          <h3 className={styles.head}>Product</h3>
          <ul className={styles.list}>
            <li>
              <a
                href={isHome ? '#tournaments' : '/#tournaments'}
                onClick={(e) => scrollToSection(e, 'tournaments')}
              >
                Tournaments
              </a>
            </li>
            <li>
              <Link to="/grounds">Grounds</Link>
            </li>
            <li>
              <a href={isHome ? '#steps' : '/#steps'} onClick={(e) => scrollToSection(e, 'steps')}>
                How it Works
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className={`${styles.bottom} bleed`}>
        <span>© 2026 NForceOne. All rights reserved.</span>
        <span>NForce Arena: cricket tournament management</span>
      </div>
    </footer>
  );
}
