import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from '../hooks/useAnchoredPopover';

export interface MonthYearFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  clearable?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEAR_PAGE_SIZE = 12;

function parseYearMonth(v: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1 };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function MonthYearField({
  value,
  onChange,
  placeholder = 'Select month',
  min,
  max,
  clearable = false,
  disabled = false,
  ariaLabel,
}: MonthYearFieldProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseYearMonth(value);
  const minYear = min ? Number(min.slice(0, 4)) : undefined;
  const maxYear = max ? Number(max.slice(0, 4)) : undefined;
  const defaultAnchorYear = maxYear ?? new Date().getFullYear();

  const [mode, setMode] = useState<'years' | 'months'>('years');
  const [activeYear, setActiveYear] = useState(parsed?.year ?? defaultAnchorYear);
  const [pageStart, setPageStart] = useState(
    (parsed?.year ?? defaultAnchorYear) - YEAR_PAGE_SIZE + 1,
  );

  const close = useCallback(() => setOpen(false), []);
  const { triggerRef, popoverRef, position } = useAnchoredPopover(open, close);

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
    const anchor = parsed?.year ?? defaultAnchorYear;
    setActiveYear(anchor);
    setPageStart(anchor - YEAR_PAGE_SIZE + 1);
    setMode(parsed ? 'months' : 'years');
    setOpen(true);
  }

  function pickMonth(year: number, month: number) {
    onChange(`${year}-${pad(month + 1)}`);
    setOpen(false);
  }

  function openYear(year: number) {
    setActiveYear(year);
    setMode('months');
  }

  const displayValue = parsed ? `${MONTHS[parsed.month]} ${parsed.year}` : null;
  const fieldLabel = ariaLabel ?? 'Month and year';

  const prevPageDisabled = minYear !== undefined && pageStart - 1 < minYear;
  const nextPageDisabled = maxYear !== undefined && pageStart + YEAR_PAGE_SIZE > maxYear;
  const prevYearDisabled = minYear !== undefined && activeYear - 1 < minYear;
  const nextYearDisabled = maxYear !== undefined && activeYear + 1 > maxYear;

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
          <div
            className="dt-popover"
            role="dialog"
            ref={popoverRef}
            style={{ position: 'fixed', top: position.top, left: position.left }}
          >
            {mode === 'years' ? (
              <div className="dt-cal">
                <div className="dt-cal-head">
                  <button
                    type="button"
                    className="dt-nav"
                    aria-label="Earlier years"
                    disabled={prevPageDisabled}
                    onClick={() => setPageStart((p) => p - YEAR_PAGE_SIZE)}
                  >
                    ‹
                  </button>
                  <span className="dt-cal-title num">
                    {pageStart} – {pageStart + YEAR_PAGE_SIZE - 1}
                  </span>
                  <button
                    type="button"
                    className="dt-nav"
                    aria-label="Later years"
                    disabled={nextPageDisabled}
                    onClick={() => setPageStart((p) => p + YEAR_PAGE_SIZE)}
                  >
                    ›
                  </button>
                </div>
                <div className="dt-year-grid">
                  {Array.from({ length: YEAR_PAGE_SIZE }, (_, i) => pageStart + i).map((year) => {
                    const isDisabled =
                      (minYear !== undefined && year < minYear) ||
                      (maxYear !== undefined && year > maxYear);
                    const isSelected = parsed?.year === year;
                    return (
                      <button
                        type="button"
                        key={year}
                        className={['dt-year', isSelected && 'dt-year-selected']
                          .filter(Boolean)
                          .join(' ')}
                        disabled={isDisabled}
                        onClick={() => openYear(year)}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="dt-cal">
                <div className="dt-cal-head">
                  <button
                    type="button"
                    className="dt-nav"
                    aria-label="Previous year"
                    disabled={prevYearDisabled}
                    onClick={() => setActiveYear((y) => y - 1)}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="dt-cal-title dt-cal-title-button num"
                    onClick={() => {
                      setPageStart(activeYear - YEAR_PAGE_SIZE + 1);
                      setMode('years');
                    }}
                  >
                    {activeYear}
                  </button>
                  <button
                    type="button"
                    className="dt-nav"
                    aria-label="Next year"
                    disabled={nextYearDisabled}
                    onClick={() => setActiveYear((y) => y + 1)}
                  >
                    ›
                  </button>
                </div>
                <div className="dt-month-grid">
                  {MONTHS.map((label, month) => {
                    const ym = `${activeYear}-${pad(month + 1)}`;
                    const isDisabled = (min && ym < min) || (max && ym > max);
                    const isSelected = parsed?.year === activeYear && parsed.month === month;
                    return (
                      <button
                        type="button"
                        key={label}
                        className={['dt-month', isSelected && 'dt-month-selected']
                          .filter(Boolean)
                          .join(' ')}
                        disabled={!!isDisabled}
                        onClick={() => pickMonth(activeYear, month)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
