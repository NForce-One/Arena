import type { ReactNode } from 'react';
import styles from './Benefits.module.css';

interface Benefit {
  title: string;
  desc: string;
  icon: ReactNode;
}

const BENEFITS: Benefit[] = [
  {
    title: 'Standings that rebuild',
    desc: 'The points table is recomputed from every result on record. Correct a score and the whole table follows, with no stale numbers.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 12a8 8 0 0 1 14-5M20 12a8 8 0 0 1-14 5" strokeLinecap="round" />
        <path d="M18 3v4h-4M6 21v-4h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'No double bookings',
    desc: 'Overlapping bookings on one ground are refused by the database itself, not by a check that two people can race past.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4" y="5" width="16" height="16" rx="2" />
        <path d="M4 10h16M9 3v4M15 3v4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Roles that mean something',
    desc: 'Permissions are enforced on the server, so an address typed straight into the bar gets a real refusal, not a hidden button.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z" />
      </svg>
    ),
  },
  {
    title: 'Public pages, no login',
    desc: 'Players, parents and clubs follow fixtures, tables and profiles without an account. Drafts stay invisible until published.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Availability, honoured',
    desc: "A ground's opening hours are checked on every route that could book it. There is no side door that skips the rule.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 19h16M6 19V9l6-4 6 4v10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'A full audit trail',
    desc: 'Every grant, booking, appointment and result records who did it and when. Disputes get an answer, not a shrug.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M6 4h9l3 3v13H6z" />
        <path d="M9 10h6M9 14h6" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function Benefits() {
  return (
    <section className="band bleed" id="benefits" style={{ paddingTop: 8 }}>
      <h2 className="head">
        Built to be <span className="r">trusted</span> with a season.
      </h2>
      <p className="deck">
        The unglamorous parts, done properly, because a fixture list that quietly corrupts itself is
        worse than a spreadsheet.
      </p>
      <div className={styles.enclosure}>
        <div className={styles.grid}>
          {BENEFITS.map((b) => (
            <div key={b.title} className={styles.item}>
              <div className={styles.badge}>{b.icon}</div>
              <h3>{b.title}</h3>
              <p>{b.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
