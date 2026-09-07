import type { ReactNode } from 'react';
import styles from './Steps.module.css';

interface Step {
  n: string;
  title: string;
  desc: string;
  icon: ReactNode;
}

const STEPS: Step[] = [
  {
    n: 'STEP 01',
    title: 'Draw up the fixtures',
    desc: 'Create the tournament, set its format and age group, and lay out the fixture list. It stays a private draft until you publish it.',
    icon: (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--red)"
        strokeWidth="1.7"
      >
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M9 3v3h6V3M8 11h5M8 15h8M16 9v4" />
      </svg>
    ),
  },
  {
    n: 'STEP 02',
    title: 'Lock in the grounds',
    desc: 'Send a booking request straight from the fixture. The owner confirms, and the ground is held. Two matches can never share a slot.',
    icon: (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--red)"
        strokeWidth="1.7"
      >
        <path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    n: 'STEP 03',
    title: 'Fill the teamsheet',
    desc: 'Managers register their squads and umpires take their appointments. Eligibility and double-booking are both checked before confirming.',
    icon: (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--red)"
        strokeWidth="1.7"
      >
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.3" />
        <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5M16 14c3 0 5 1.6 5 4.4" />
      </svg>
    ),
  },
  {
    n: 'STEP 04',
    title: 'Enter the result',
    desc: "Scores go in as they're written: 203/4, not a bare number. The points table rebuilds itself from every result on file.",
    icon: (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--red)"
        strokeWidth="1.7"
      >
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" />
        <circle cx="12" cy="10" r="2.8" />
      </svg>
    ),
  },
];

export function Steps() {
  return (
    <section className="band bleed" id="steps" style={{ paddingTop: 8 }}>
      <h2 className="head">
        <span className="r">How a season</span> runs.
      </h2>
      <p className="deck">
        Four moves. Each one hands off cleanly to the next, so nothing has to be chased down over
        the phone.
      </p>
      <div className={styles.enclosure}>
        <div className={styles.grid}>
          {STEPS.map((s) => (
            <div key={s.n} className={styles.cell}>
              {s.icon}
              <div>
                <span className={styles.num}>{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
