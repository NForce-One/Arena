import { useEffect, useState } from 'react';

const COMMENTARY = ["Third umpire's making the call…", 'He steams in... BOWLED!'];

const PHASE_MS = 1500;

export function MatchLoader({ caption }: { caption: string }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;
    const id = setInterval(() => {
      setPhase((p) => (p + 1) % COMMENTARY.length);
    }, PHASE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="match-overlay" role="status" aria-live="polite">
      <div className="ml-stage">
        <img src="/loading/match-loader.gif" alt={caption} className="ml-gif" />
      </div>

      <div className="match-text">
        <p className="match-caption">{caption}</p>
        <p className="match-commentary">{COMMENTARY[phase]}</p>
      </div>
    </div>
  );
}
