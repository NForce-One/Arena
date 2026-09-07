import { Fragment, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseISODate, toISODate } from '../lib/calendar';
import { useAnchoredPopover } from '../hooks/useAnchoredPopover';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { MonthCalendar } from './MonthCalendar';

export interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  clearable?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export function DateField({
  value,
  onChange,
  label,
  placeholder = 'Select date',
  min,
  max,
  clearable = false,
  disabled = false,
  ariaLabel,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = parseISODate(value);
  const today = new Date();
  const [view, setView] = useState(() => selected ?? today);
  const close = useCallback(() => setOpen(false), []);
  const { triggerRef, popoverRef, position } = useAnchoredPopover(open, close);
  const isSheet = useMediaQuery('(max-width: 540px)');

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

  function openPopover() {
    if (disabled) return;
    setView(selected ?? today);
    setOpen(true);
  }

  const displayValue = value
    ? parseISODate(value)?.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;
  const fieldLabel = ariaLabel ?? label ?? 'Date';

  function pick(d: Date) {
    onChange(toISODate(d));
    setOpen(false);
  }

  return (
    <div className="dt-field" ref={triggerRef}>
      <button
        type="button"
        className="dt-trigger"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPopover())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={displayValue ? `${fieldLabel}: ${displayValue}` : fieldLabel}
      >
        <span className={value ? 'dt-trigger-value num' : 'dt-trigger-placeholder'}>
          {displayValue ?? placeholder}
        </span>
        {clearable && value && !disabled && (
          <span
            className="dt-clear"
            role="button"
            tabIndex={-1}
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
          >
            ×
          </span>
        )}
      </button>

      {open &&
        position &&
        createPortal(
          <Fragment>
            {isSheet && (
              <button
                type="button"
                aria-label="Close date picker"
                className="dt-sheet-backdrop"
                onClick={() => setOpen(false)}
              />
            )}
            <div
              className={`dt-popover${isSheet ? ' dt-popover-sheet' : ''}`}
              role="dialog"
              ref={popoverRef}
              style={{ position: 'fixed', top: position.top, left: position.left }}
            >
              <MonthCalendar
                view={view}
                onViewChange={setView}
                valueISO={value}
                onPick={pick}
                min={min}
                max={max}
              />
            </div>
          </Fragment>,
          document.body,
        )}
    </div>
  );
}
