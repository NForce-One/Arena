import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from '../hooks/useAnchoredPopover';

const DAYS = [
  { code: 'sun', label: 'Sunday', short: 'Sun' },
  { code: 'mon', label: 'Monday', short: 'Mon' },
  { code: 'tue', label: 'Tuesday', short: 'Tue' },
  { code: 'wed', label: 'Wednesday', short: 'Wed' },
  { code: 'thu', label: 'Thursday', short: 'Thu' },
  { code: 'fri', label: 'Friday', short: 'Fri' },
  { code: 'sat', label: 'Saturday', short: 'Sat' },
] as const;
const DAY_CODES = DAYS.map((d) => d.code);

function parseDays(value: string): Set<string> {
  const v = value.trim().toLowerCase();
  if (v === 'all') return new Set(DAY_CODES);
  return new Set(v.split(/[,\s]+/).filter((d) => (DAY_CODES as readonly string[]).includes(d)));
}

function summarize(selected: Set<string>): string {
  if (selected.size === 0) return 'Select days';
  if (selected.size === 7) return 'Every day';
  return DAYS.filter((d) => selected.has(d.code))
    .map((d) => d.short)
    .join(', ');
}

export interface DaysFieldProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

export function DaysField({
  value,
  onChange,
  ariaLabel = 'Days',
  disabled = false,
}: DaysFieldProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { triggerRef, popoverRef, position } = useAnchoredPopover(open, close);
  const selected = parseDays(value);
  const allSelected = selected.size === 7;

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

  function toggleAll() {
    onChange(allSelected ? '' : 'all');
  }

  function toggleDay(code: string) {
    if (allSelected) return;
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    if (next.size === 7) {
      onChange('all');
      return;
    }
    onChange(DAY_CODES.filter((d) => next.has(d)).join(','));
  }

  return (
    <div className="dt-field" ref={triggerRef}>
      <button
        type="button"
        className="dt-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${summarize(selected)}`}
      >
        <span className={selected.size ? 'dt-trigger-value' : 'dt-trigger-placeholder'}>
          {summarize(selected)}
        </span>
      </button>

      {open &&
        position &&
        createPortal(
          <div
            className="dt-popover dt-popover-days"
            role="dialog"
            aria-label={ariaLabel}
            ref={popoverRef}
            style={{ position: 'fixed', top: position.top, left: position.left }}
          >
            <div className="dt-day-list">
              <label className="dt-day-option dt-day-option-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={disabled}
                />
                <span>All days</span>
              </label>
              <div className="dt-day-divider" />
              {DAYS.map((d) => (
                <label className="dt-day-option" key={d.code}>
                  <input
                    type="checkbox"
                    checked={allSelected || selected.has(d.code)}
                    onChange={() => toggleDay(d.code)}
                    disabled={disabled || allSelected}
                  />
                  <span>{d.label}</span>
                </label>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
