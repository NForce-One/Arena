import { Header } from '../layout/Header';
import { SearchPanel } from './SearchPanel';
import styles from './Hero.module.css';

export function Hero() {
  return (
    <div className={styles.stage}>
      <div className={styles.photoLayer}>
        <div className={styles.photo} data-hero="light">
          <img src="/assets/hero-day-3.png" alt="Cricket stadium by daylight" />
        </div>
        <div className={styles.photo} data-hero="dark">
          <img src="/assets/hero-night-3.png" alt="Cricket stadium under floodlights" />
        </div>
        <div className={styles.scrim} />
      </div>

      <Header overHero />

      <div className={`${styles.body} bleed`}>
        <h1 className={styles.h1}>
          <span>PLAY. COMPETE.</span>
          <span className={styles.accent}>CREATE LEGACY.</span>
        </h1>
        <p className={styles.sub}>
          Discover and join the best cricket tournaments happening around you.
        </p>
        <div className={styles.rule} />

        <SearchPanel />
        <div style={{ height: 36 }} />
      </div>
    </div>
  );
}
