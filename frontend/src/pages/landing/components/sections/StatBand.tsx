import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useInView } from '../../hooks/useInView';
import { usePublicTournaments } from '../../data/tournaments';
import styles from './StatBand.module.css';

interface Stat {
  count: number;
  label: string;
  icon: ReactNode;
}

export function StatBand() {
  const bandRef = useRef<HTMLElement>(null);
  const inView = useInView(bandRef, { threshold: 0.3 });
  const tournaments = usePublicTournaments();

  const stats: Stat[] = [
    {
      count: tournaments?.length ?? 0,
      label: 'Tournaments Run',
      icon: (
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--red)"
          strokeWidth="1.6"
        >
          <path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z" />
          <path d="M9.5 11.5h5M12 9v5" />
        </svg>
      ),
    },
    {
      count: tournaments?.reduce((sum, t) => sum + t.teamsCount, 0) ?? 0,
      label: 'Teams Registered',
      icon: (
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--red)"
          strokeWidth="1.6"
        >
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.3" />
          <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5M16 14c3 0 5 1.6 5 4.4" />
        </svg>
      ),
    },
  ];

  const [values, setValues] = useState<number[]>(() => stats.map(() => 0));

  useEffect(() => {
    if (!inView || !tournaments) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setValues(stats.map((s) => s.count));
      return;
    }
    const dur = 1400;
    const stepMs = 40;
    let t = 0;
    const id = window.setInterval(() => {
      t += stepMs;
      const p = Math.min(t / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValues(stats.map((s) => Math.round(s.count * eased)));
      if (p >= 1) window.clearInterval(id);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [inView, tournaments]);

  return (
    <section ref={bandRef} className={`${styles.band} bleed`}>
      <div className={styles.grid}>
        {stats.map((s, i) => (
          <div key={s.label} className={styles.cell}>
            {s.icon}
            <div>
              <div className={styles.value}>{(values[i] ?? 0).toLocaleString()}</div>
              <div className={styles.label}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
