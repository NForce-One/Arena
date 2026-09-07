import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildTimeSlots, parseISODate, toISODate } from '../lib/calendar';
import { useAnchoredPopover } from '../hooks/useAnchoredPopover';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { MonthCalendar } from './MonthCalendar';

export interface DateTimeFieldProps {
  value: string;
  onChange: (value: string) => void;
  dateAriaLabel?: string;
  timeAriaLabel?: string;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  step?: number;
}

const SLOTS_15 = buildTimeSlots(15);

export function DateTimeField({
  value,
  onChange,
  dateAriaLabel = 'Date',
  timeAriaLabel = 'Time',
  disabled = false,
  minDate,
  maxDate,
  step = 15,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const parts = value.split('T');
  const datePart = parts[0] ?? '';
  const timePart = parts[1] ?? '';
  const today = new Date();
  const earliest = minDate ? parseISODate(minDate) : null;
  const defaultDate = earliest && earliest > today ? earliest : today;
  const selectedDate = parseISODate(datePart) ?? defaultDate;
  const [view, setView] = useState(selectedDate);
  const listRef = useRef<HTMLDivElement>(null);
  const slots = step === 15 ? SLOTS_15 : buildTimeSlots(step);
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
    listRef.current
      .querySelector<HTMLElement>('.dt-time-selected')
      ?.scrollIntoView({ block: 'center' });
  }, [open]);

  function openPopover() {
    if (disabled) return;
    setView(parseISODate(datePart) ?? defaultDate);
    setOpen(true);
  }

  function pickDate(d: Date) {
    onChange(`${toISODate(d)}T${timePart}`);
  }

  function pickTime(t: string) {
    onChange(`${datePart || toISODate(selectedDate)}T${t}`);
    setOpen(false);
  }

  const fieldLabel = `${dateAriaLabel} & ${timeAriaLabel}`;
  const triggerValue =
    datePart && timePart
      ? `${parseISODate(datePart)?.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${timePart}`
      : null;
  const headerDate = parseISODate(datePart) ?? selectedDate;
  const headerLabel = headerDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric' });

  return (
    <div className="dt-field" ref={triggerRef}>
      <button
        type="button"
        className="dt-trigger"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPopover())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerValue ? `${fieldLabel}: ${triggerValue}` : fieldLabel}
      >
        <span className={triggerValue ? 'dt-trigger-value num' : 'dt-trigger-placeholder'}>
          {triggerValue ?? 'Pick a date & time'}
        </span>
      </button>

      {open &&
        position &&
        createPortal(
          <Fragment>
            {isSheet && (
              <button
                type="button"
                aria-label="Close date and time picker"
                className="dt-sheet-backdrop"
                onClick={() => setOpen(false)}
              />
            )}
            <div
              className={`dt-popover dt-popover-combo${isSheet ? ' dt-popover-sheet' : ''}`}
              role="dialog"
              ref={popoverRef}
              style={{ position: 'fixed', top: position.top, left: position.left }}
            >
              <MonthCalendar
                view={view}
                onViewChange={setView}
                valueISO={datePart}
                onPick={pickDate}
                min={minDate}
                max={maxDate}
              />
              <div className="dt-combo-divider" aria-hidden="true" />
              <div className="dt-combo-time">
                <div className="dt-combo-time-head">{headerLabel}</div>
                <div className="dt-time-list" ref={listRef}>
                  {slots.map((t) => (
                    <button
                      type="button"
                      key={t}
                      className={`dt-time-option num${t === timePart ? ' dt-time-selected' : ''}`}
                      onClick={() => pickTime(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Fragment>,
          document.body,
        )}
    </div>
  );
}
