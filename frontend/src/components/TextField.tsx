import { useState } from 'react';

interface TextFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password' | 'date';
  value: string;
  onChange(value: string): void;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  max?: string;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12s-4 7.5-10.5 7.5S1.5 12 1.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12s-4 7.5-10.5 7.5S1.5 12 1.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line
        x1="3"
        y1="21"
        x2="21"
        y2="3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TextField(props: TextFieldProps) {
  const id = `field-${props.name}`;
  const isPassword = props.type === 'password';
  const [revealed, setRevealed] = useState(false);

  const input = (
    <input
      id={id}
      name={props.name}
      type={isPassword && revealed ? 'text' : (props.type ?? 'text')}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      autoComplete={props.autoComplete}
      placeholder={props.placeholder}
      aria-invalid={props.error ? true : undefined}
      required={props.required}
      max={props.max}
    />
  );

  return (
    <div className="field">
      <label htmlFor={id}>
        {props.label}
        {props.required && (
          <span className="field-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {isPassword ? (
        <div className="field-input-wrap">
          {input}
          <button
            type="button"
            className="field-reveal-toggle"
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      ) : (
        input
      )}
      {props.error && <div className="field-error">{props.error}</div>}
    </div>
  );
}
