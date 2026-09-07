import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Hero } from './components/sections/Hero';
import { StatBand } from './components/sections/StatBand';
import { Steps } from './components/sections/Steps';
import { Benefits } from './components/sections/Benefits';
import { TournamentsList } from './components/sections/TournamentsList';
import { Footer } from './components/layout/Footer';

export function HomePage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [hash]);

  return (
    <div className="shell">
      <Hero />
      <StatBand />
      <TournamentsList />
      <Steps />
      <Benefits />
      <Footer />
    </div>
  );
}
