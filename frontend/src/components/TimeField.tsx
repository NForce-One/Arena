import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildTimeSlots } from '../lib/calendar';
import { useAnchoredPopover } from '../hooks/useAnchoredPopover';
import { useMediaQuery } from '../hooks/useMediaQuery';

export interface TimeFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  step?: number;
  ariaLabel?: string;
}

export function TimeField({
  value,
  onChange,
  label,
  placeholder = 'Select time',
  disabled = false,
  step = 15,
  ariaLabel,
}: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const slots = buildTimeSlots(step);
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

  useEffect(() => {
    if (!open || !listRef.current) return;
    const target = listRef.current.querySelector<HTMLElement>('.dt-time-selected');
    target?.scrollIntoView({ block: 'center' });
  }, [open]);

  function pick(t: string) {
    onChange(t);
    setOpen(false);
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
        aria-label={
          value ? `${ariaLabel ?? label ?? 'Time'}: ${value}` : (ariaLabel ?? label ?? 'Time')
        }
      >
        <span className={value ? 'dt-trigger-value num' : 'dt-trigger-placeholder'}>
          {value || placeholder}
        </span>
      </button>

      {open &&
        position &&
        createPortal(
          <Fragment>
            {isSheet && (
              <button
                type="button"
                aria-label="Close time picker"
                className="dt-sheet-backdrop"
                onClick={() => setOpen(false)}
              />
            )}
            <div
              className={`dt-popover dt-popover-time${isSheet ? ' dt-popover-sheet' : ''}`}
              role="dialog"
              ref={popoverRef}
              style={{ position: 'fixed', top: position.top, left: position.left }}
            >
              <div className="dt-time-list" ref={listRef}>
                {slots.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={`dt-time-option num${t === value ? ' dt-time-selected' : ''}`}
                    onClick={() => pick(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </Fragment>,
          document.body,
        )}
    </div>
  );
}
