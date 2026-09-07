import type { AvailabilityRuleDto, GroundSearchResultDto } from '@nforce/shared';
import { availabilityProblem } from '@nforce/shared';
import { useEffect, useMemo, useState } from 'react';
import { ruleWindow } from '../lib/calendar';
import { describeRule, describeRuleDates } from '../lib/grounds';

const PAGE_SIZE = 12;

export interface GroundPickerProps {
  grounds: GroundSearchResultDto[];
  value: string;
  onChange: (groundId: string) => void;
  startsAt: Date | null;
  endsAt: Date | null;
}

export function GroundPicker({ grounds, value, onChange, startsAt, endsAt }: GroundPickerProps) {
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

  const hasSlot = !!startsAt && !!endsAt && !Number.isNaN(startsAt.getTime());
  const dayISO = hasSlot ? startsAt!.toISOString().slice(0, 10) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grounds;
    return grounds.filter(
      (g) => g.name.toLowerCase().includes(q) || g.location.toLowerCase().includes(q),
    );
  }, [grounds, query]);

  function verdict(g: GroundSearchResultDto): { ok: boolean; text: string } | null {
    if (!hasSlot || !dayISO || !startsAt || !endsAt) return null;
    const problem = availabilityProblem(g.availabilityRules, startsAt, endsAt);
    if (!problem) return { ok: true, text: 'Available' };
    if (problem.openWindows) {
      const windows = problem.openWindows.map((w) => ruleWindow(w.from, w.to)).join(', ');
      return { ok: false, text: `Open ${windows} that day` };
    }
    return { ok: false, text: problem.reason };
  }

  const fitCount = hasSlot ? filtered.filter((g) => verdict(g)?.ok).length : null;

  function describeRuleOn(r: AvailabilityRuleDto, day: string | null): string {
    if (!day) return describeRule(r);
    return `${r.days} ${ruleWindow(r.from, r.to)}${describeRuleDates(r)}`;
  }

  return (
    <div className="ground-picker">
      <div className="form-row">
        <input
          placeholder="Filter grounds by name or place…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter grounds"
        />
      </div>
      {fitCount !== null && (
        <p className="muted">
          <span className="num">{fitCount}</span> of <span className="num">{filtered.length}</span>{' '}
          ground{filtered.length === 1 ? '' : 's'} can take the time you picked.
        </p>
      )}

      <div className="ground-options">
        <button
          type="button"
          className={`ground-option${value === '' ? ' ground-option-selected' : ''}`}
          onClick={() => onChange('')}
          aria-pressed={value === ''}
        >
          <span className="ground-option-name">No ground</span>
          <span className="muted">
            Create the match without a ground. No booking request is sent. You can add one later
            with Reschedule.
          </span>
        </button>

        {filtered.length === 0 && <p className="muted">No grounds match “{query}”.</p>}

        {filtered.slice(0, visibleCount).map((g) => {
          const v = verdict(g);
          return (
            <button
              type="button"
              key={g.id}
              className={`ground-option${value === g.id ? ' ground-option-selected' : ''}`}
              onClick={() => onChange(g.id)}
              aria-pressed={value === g.id}
            >
              <span className="ground-option-head">
                <span className="ground-option-name" title={g.name}>
                  {g.name}
                </span>
                {v && <span className={`chip ${v.ok ? 'chip-ok' : 'chip-warn'}`}>{v.text}</span>}
              </span>
              <span className="muted">
                {g.location}
                {g.capacity ? ` · capacity ${g.capacity}` : ''}
                {g.facilities.length > 0 ? ` · ${g.facilities.join(', ')}` : ''}
              </span>
              <span className="ground-option-hours">
                {g.availabilityRules.length === 0 ? (
                  <span className="muted">No availability set</span>
                ) : (
                  g.availabilityRules.map((r, i) => (
                    <span key={i} className="num">
                      {describeRuleOn(r, dayISO)}
                    </span>
                  ))
                )}
              </span>
            </button>
          );
        })}
      </div>

      {visibleCount < filtered.length && (
        <button
          type="button"
          className="btn btn-ghost btn-small ground-show-more"
          onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
        >
          Show more grounds ({filtered.length - visibleCount} more)
        </button>
      )}
    </div>
  );
}
