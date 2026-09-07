import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from '../hooks/useAnchoredPopover';
import { US_STATES } from '../lib/usStates';

export interface StateFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  allOptionLabel?: string;
}

export function StateField({
  value,
  onChange,
  label,
  placeholder = 'Select state',
  disabled = false,
  ariaLabel,
  allOptionLabel,
}: StateFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const q = query.trim().toLowerCase();
  const filtered = q ? US_STATES.filter((s) => s.toLowerCase().includes(q)) : US_STATES;

  const { triggerRef, popoverRef, position } = useAnchoredPopover(open, close, filtered.length);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, triggerRef, popoverRef]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const raf = requestAnimationFrame(() => {
      searchRef.current?.focus();
      listRef.current
        ?.querySelector<HTMLElement>('.dt-search-selected')
        ?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  const displayValue = value || (allOptionLabel ? allOptionLabel : null);
  const fieldLabel = ariaLabel ?? label ?? 'State';

  return (
    <div className="dt-field" ref={triggerRef}>
      <button
        type="button"
        className="dt-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={displayValue ? `${fieldLabel}: ${displayValue}` : fieldLabel}
      >
        <span className={displayValue ? 'dt-trigger-value' : 'dt-trigger-placeholder'}>
          {displayValue ?? placeholder}
        </span>
      </button>

      {open &&
        position &&
        createPortal(
          <div
            className="dt-popover dt-popover-search"
            role="dialog"
            ref={popoverRef}
            style={{ position: 'fixed', top: position.top, left: position.left }}
          >
            <input
              ref={searchRef}
              type="text"
              className="dt-search-input"
              placeholder="Search states…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search states"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length > 0) {
                  e.preventDefault();
                  pick(filtered[0]!);
                }
              }}
            />
            <div className="dt-search-list" ref={listRef}>
              {allOptionLabel && !q && (
                <button
                  type="button"
                  className={`dt-search-option${value === '' ? ' dt-search-selected' : ''}`}
                  onClick={() => pick('')}
                >
                  {allOptionLabel}
                </button>
              )}
              {filtered.length === 0 && <div className="dt-search-empty">No states match.</div>}
              {filtered.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={`dt-search-option${s === value ? ' dt-search-selected' : ''}`}
                  onClick={() => pick(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
