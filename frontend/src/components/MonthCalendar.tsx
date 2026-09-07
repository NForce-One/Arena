import { buildMonthGrid, toISODate, todayISODate } from '../lib/calendar';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export interface MonthCalendarProps {
  view: Date;
  onViewChange: (d: Date) => void;
  valueISO: string;
  onPick: (d: Date) => void;
  min?: string;
  max?: string;
}

export function MonthCalendar({
  view,
  onViewChange,
  valueISO,
  onPick,
  min,
  max,
}: MonthCalendarProps) {
  const cells = buildMonthGrid(view.getFullYear(), view.getMonth());
  const monthLabel = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const todayISO = todayISODate();

  return (
    <div className="dt-cal">
      <div className="dt-cal-head">
        <button
          type="button"
          className="dt-nav"
          aria-label="Previous month"
          onClick={() => onViewChange(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
        >
          ‹
        </button>
        <span className="dt-cal-title">{monthLabel}</span>
        <button
          type="button"
          className="dt-nav"
          aria-label="Next month"
          onClick={() => onViewChange(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
        >
          ›
        </button>
      </div>
      <div className="dt-weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="dt-grid">
        {cells.map((d) => {
          const iso = toISODate(d);
          const outside = d.getMonth() !== view.getMonth();
          const isSelected = iso === valueISO;
          const isToday = iso === todayISO;
          const isDisabled = (min && iso < min) || (max && iso > max);
          return (
            <button
              type="button"
              key={iso}
              className={[
                'dt-day',
                outside && 'dt-day-outside',
                isSelected && 'dt-day-selected',
                isToday && 'dt-day-today',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!!isDisabled}
              onClick={() => onPick(d)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
