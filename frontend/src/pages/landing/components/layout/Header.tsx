import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ThemeToggle } from './ThemeToggle';
import styles from './Header.module.css';

interface HeaderProps {
  overHero?: boolean;
}

export function Header({ overHero = false }: HeaderProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isHome = pathname === '/';
  const tournamentsHref = isHome ? '#tournaments' : '/#tournaments';
  const howItWorksHref = isHome ? '#steps' : '/#steps';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  function scrollToSection(e: MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    setMenuOpen(false);
    if (isHome) {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${id}`);
    } else {
      navigate(`/#${id}`);
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent | globalThis.MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || menuBtnRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown as (e: globalThis.MouseEvent) => void);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown as (e: globalThis.MouseEvent) => void);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className={`${styles.top} ${overHero ? styles.overHero : styles.solid}`}>
      <div className={styles.brand}>
        <svg width="49" height="55" viewBox="0 0 44 50" fill="none">
          <path
            d="M2 4 L22 1 L42 4 V27 C42 39 33 45.5 22 49 C11 45.5 2 39 2 27 Z"
            fill="#1a1c20"
            stroke="#e11b22"
            strokeWidth="2.4"
          />
          <path d="M13 34 L28 14" stroke="#f6f6f6" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M27 12.5 L31.5 16.5" stroke="#e11b22" strokeWidth="4" strokeLinecap="round" />
          <circle cx="14.5" cy="17" r="3" fill="#f6f6f6" />
          <path d="M20 36 L26 36" stroke="#e11b22" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <div>
          <Link to="/" className={styles.brandWord}>
            NForce <b>Arena</b>
          </Link>
          <div className={styles.brandTag}>HOST. COMPETE. WIN.</div>
        </div>
      </div>

      <nav className={styles.nav}>
        <a href={tournamentsHref} onClick={(e) => scrollToSection(e, 'tournaments')}>
          Tournaments
        </a>
        <Link to="/grounds">Grounds</Link>
        <a href={howItWorksHref} onClick={(e) => scrollToSection(e, 'steps')}>
          How it Works
        </a>
      </nav>

      <div className={styles.right}>
        <button
          ref={menuBtnRef}
          type="button"
          className={styles.menuBtn}
          aria-label="Toggle navigation menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <ThemeToggle />
        <div className={styles.auth}>
          <Link to="/login" className={styles.login}>
            Log in
          </Link>
          <Link to="/signup" className={styles.signup}>
            Sign up
          </Link>
        </div>
      </div>

      {menuOpen && (
        <div ref={menuRef} className={styles.mobileMenu} role="menu" aria-label="Site navigation">
          <a
            href={tournamentsHref}
            role="menuitem"
            onClick={(e) => scrollToSection(e, 'tournaments')}
          >
            Tournaments
          </a>
          <Link to="/grounds" role="menuitem" onClick={() => setMenuOpen(false)}>
            Grounds
          </Link>
          <a href={howItWorksHref} role="menuitem" onClick={(e) => scrollToSection(e, 'steps')}>
            How it Works
          </a>
        </div>
      )}
    </header>
  );
}
