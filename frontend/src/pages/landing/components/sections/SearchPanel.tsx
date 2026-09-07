import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { DateField } from '../../../../components/DateField';
import { StateField } from '../../../../components/StateField';
import {
  formatsIn,
  formatsLabel,
  suggestTournaments,
  usePublicTournaments,
} from '../../data/tournaments';
import styles from './SearchPanel.module.css';

export function SearchPanel() {
  const navigate = useNavigate();
  const tournaments = usePublicTournaments();

  const [q, setQ] = useState('');
  const [format, setFormat] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [date, setDate] = useState('');

  const [formatOpen, setFormatOpen] = useState(false);
  const [qFocused, setQFocused] = useState(false);

  const formatRef = useRef<HTMLDivElement>(null);
  const qRef = useRef<HTMLLabelElement>(null);
  const formatButtonRef = useRef<HTMLButtonElement>(null);

  const formats = useMemo(() => formatsIn(tournaments ?? []), [tournaments]);
  const suggestions = useMemo(() => suggestTournaments(tournaments ?? [], q), [tournaments, q]);
  const suggestOpen = qFocused && suggestions.length > 0;

  useEffect(() => {
    if (!formatOpen && !suggestOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (formatOpen && formatRef.current && !formatRef.current.contains(t)) setFormatOpen(false);
      if (suggestOpen && qRef.current && !qRef.current.contains(t)) setQFocused(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (formatOpen) {
        setFormatOpen(false);
        formatButtonRef.current?.focus();
      }
      if (suggestOpen) setQFocused(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [formatOpen, suggestOpen]);

  const submit = () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (format) params.set('format', format);
    if (state) params.set('state', state);
    if (date) params.set('date', date);
    const query = params.toString();
    navigate(query ? `/tournaments?${query}` : '/tournaments');
  };

  const pickSuggestion = (name: string) => {
    setQ(name);
    setQFocused(false);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.searchRow}>
        <label ref={qRef} className={styles.field} onFocus={() => setQFocused(true)}>
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--muted)"
            strokeWidth="1.8"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            placeholder="Search tournaments or organizers"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setQFocused(true)}
            aria-autocomplete="list"
            aria-expanded={suggestOpen}
          />
          {suggestOpen && (
            <ul className={styles.autocomplete} role="listbox" aria-label="Tournament suggestions">
              {suggestions.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={styles.autocompleteItem}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(t.name)}
                    role="option"
                    aria-selected={false}
                  >
                    <span className={styles.autocompleteName}>{t.name}</span>
                    <span className={styles.autocompleteMeta}>
                      {t.organizerName} · {formatsLabel(t)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>
      </div>

      <div className={styles.filterRow}>
        <div ref={formatRef} className={styles.field}>
          <button
            ref={formatButtonRef}
            type="button"
            className={styles.fillButton}
            onClick={() => setFormatOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={formatOpen}
          >
            <span className={format ? undefined : styles.placeholder}>
              {format ?? 'All Formats'}
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--muted)"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {formatOpen && (
            <ul className={styles.dropdown} role="listbox" aria-label="Match format">
              <li>
                <button
                  type="button"
                  className={`${styles.dropdownItem} ${format === null ? styles.dropdownItemActive : ''}`}
                  onClick={() => {
                    setFormat(null);
                    setFormatOpen(false);
                    formatButtonRef.current?.focus();
                  }}
                  role="option"
                  aria-selected={format === null}
                >
                  All Formats
                </button>
              </li>
              {formats.map((f) => (
                <li key={f}>
                  <button
                    type="button"
                    className={`${styles.dropdownItem} ${format === f ? styles.dropdownItemActive : ''}`}
                    onClick={() => {
                      setFormat(f);
                      setFormatOpen(false);
                      formatButtonRef.current?.focus();
                    }}
                    role="option"
                    aria-selected={format === f}
                  >
                    {f}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.field}>
          <div className={styles.stateFieldWrap}>
            <StateField
              value={state ?? ''}
              onChange={(v) => setState(v || null)}
              allOptionLabel="Any State"
              ariaLabel="State"
            />
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--muted)"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>

        <div className={styles.field}>
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--muted)"
            strokeWidth="1.8"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 11h18" />
          </svg>
          {}
          <div className={styles.dateFieldWrap}>
            <DateField
              value={date}
              onChange={setDate}
              placeholder="Any date"
              ariaLabel="Start date"
              clearable
            />
          </div>
        </div>

        <button type="button" className={styles.cta} onClick={submit}>
          Browse Tournaments
        </button>
      </div>
    </div>
  );
}
