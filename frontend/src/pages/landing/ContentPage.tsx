import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import styles from './ContentPage.module.css';

interface ContentPageProps {
  eyebrow: string;
  title: string;
  updated?: string;
  children: ReactNode;
}

export function ContentPage({ eyebrow, title, updated, children }: ContentPageProps) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="shell">
      <Header />
      <article className={`${styles.page} bleed`}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1 className={styles.title}>{title}</h1>
        {updated && <p className={styles.updated}>Last updated {updated}</p>}
        <div className={styles.body}>{children}</div>
      </article>
      <Footer />
    </div>
  );
}
