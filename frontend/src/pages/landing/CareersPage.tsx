import { ContentPage } from './ContentPage';
import styles from './ContentPage.module.css';

const ROLES = [
  { title: 'Backend Engineer', meta: 'Remote · Full-time' },
  { title: 'Product Designer', meta: 'Remote · Full-time' },
  { title: 'Community & Partnerships', meta: 'Remote · Part-time' },
];

export function CareersPage() {
  return (
    <ContentPage eyebrow="Careers" title="Build the platform cricket runs on">
      <p>
        NForce Arena is a small team building the tools organizers, clubs and grounds actually need
        to run a season, not a generic sports app with cricket bolted on. We&apos;re cricket people
        first, and it shows in every screen we ship.
      </p>

      <h2>How we work</h2>
      <p>
        Fully remote, small team, short feedback loops. Everyone who joins talks to organizers and
        umpires directly. The fixture list you&apos;re building has to survive a real Saturday, not
        just a demo.
      </p>

      <h2>What we look for</h2>
      <ul>
        <li>
          Care about getting the unglamorous parts right. A standings table that never drifts
          matters more than a flashy animation.
        </li>
        <li>
          Comfortable owning a feature end to end, from the data model to the screen someone taps on
          a phone at the ground.
        </li>
        <li>
          Interested in the sport, even casually. It helps when you&apos;re deciding how a
          rain-affected match should be scored.
        </li>
      </ul>

      <h2>Open roles</h2>
      <div className={styles.roles}>
        {ROLES.map((r) => (
          <div className={styles.role} key={r.title}>
            <span className={styles.roleTitle}>{r.title}</span>
            <span className={styles.roleMeta}>{r.meta}</span>
          </div>
        ))}
      </div>
      <p>
        Don&apos;t see a fit but think you&apos;d be a good addition anyway? Write to{' '}
        <a href="mailto:arena@nforceone.com">arena@nforceone.com</a> and tell us what you&apos;d
        want to build.
      </p>
    </ContentPage>
  );
}
