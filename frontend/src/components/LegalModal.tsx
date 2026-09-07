import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './dashboard/ui/Icon';
import {
  CookiesContent,
  LEGAL_UPDATED,
  PrivacyContent,
  TermsContent,
} from '../pages/landing/legalContent';
import contentStyles from '../pages/landing/ContentPage.module.css';
import styles from './LegalModal.module.css';

export type LegalDoc = 'terms' | 'privacy' | 'cookies';

interface LegalModalProps {
  open: LegalDoc | null;
  onClose: () => void;
  onNavigate?: (doc: LegalDoc) => void;
}

const TITLES: Record<LegalDoc, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Policy',
};

export function LegalModal({ open, onClose, onNavigate }: LegalModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div className={styles.headText}>
            <span className={styles.eyebrow}>Legal</span>
            <h2 id="legal-modal-title" className={styles.title}>
              {TITLES[open]}
            </h2>
            <p className={styles.updated}>Last updated {LEGAL_UPDATED}</p>
          </div>
          <button
            type="button"
            ref={closeRef}
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className={`${styles.body} ${contentStyles.body}`}>
          {open === 'terms' && <TermsContent />}
          {open === 'privacy' && (
            <PrivacyContent onCookiesClick={onNavigate ? () => onNavigate('cookies') : undefined} />
          )}
          {open === 'cookies' && <CookiesContent />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
