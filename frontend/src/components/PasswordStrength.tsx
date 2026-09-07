import { passwordRequirements } from '@nforce/shared';

export function PasswordStrength({ value }: { value: string }) {
  const total = passwordRequirements.length;
  const met = passwordRequirements.filter((r) => r.test(value)).length;
  const pct = value.length === 0 ? 0 : Math.round((met / total) * 100);
  const allMet = met === total;

  return (
    <div className="pw-strength" aria-live="polite">
      <div
        className="pw-track"
        role="progressbar"
        aria-valuenow={met}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Password strength"
      >
        <div className={`pw-fill${allMet ? ' pw-fill-done' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`pw-hint${allMet ? ' pw-hint-done' : ''}`}>
        {allMet
          ? 'Strong password ✓'
          : 'At least 8 characters, letters, a number & a special character'}
      </p>
    </div>
  );
}
