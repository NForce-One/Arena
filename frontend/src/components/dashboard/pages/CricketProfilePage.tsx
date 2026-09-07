import type {
  BattingStyle,
  BowlingStyle,
  Gender,
  HeightUnit,
  JerseySize,
  PlayingRole,
  ProfileDto,
  WeightUnit,
} from '@nforce/shared';
import {
  BATTING_STYLES,
  BATTING_STYLE_LABELS,
  battingStyleLabel,
  BOWLING_STYLES,
  BOWLING_STYLE_LABELS,
  bowlingStyleLabel,
  GENDERS,
  GENDER_LABELS,
  HEIGHT_UNITS,
  HEIGHT_UNIT_LABELS,
  JERSEY_SIZES,
  JERSEY_SIZE_LABELS,
  PLAYING_ROLES,
  PLAYING_ROLE_LABELS,
  sportsProfileSchema,
  WEIGHT_UNITS,
  WEIGHT_UNIT_LABELS,
} from '@nforce/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../../../auth/AuthContext';
import { api } from '../../../lib/apiClient';
import { errorsFrom, validateForm, type FieldErrors } from '../../../lib/forms';
import { Icon } from '../ui/Icon';
import styles from './CricketProfilePage.module.css';

const STEPS = ['Contact', 'Jersey', 'Playing style', 'Review & consent'] as const;

interface FormState {
  phone: string;
  school: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  jerseyNumber: string;
  jerseyName: string;
  jerseySize: JerseySize | '';
  battingStyle: BattingStyle | '';
  battingStyleOther: string;
  bowlingStyle: BowlingStyle | '';
  bowlingStyleOther: string;
  playingRole: PlayingRole | '';
  heightValue: string;
  heightUnit: HeightUnit | '';
  weightValue: string;
  weightUnit: WeightUnit | '';
  gender: Gender | '';
  consentAccepted: boolean;
}

const EMPTY_FORM: FormState = {
  phone: '',
  school: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  jerseyNumber: '',
  jerseyName: '',
  jerseySize: '',
  battingStyle: '',
  battingStyleOther: '',
  bowlingStyle: '',
  bowlingStyleOther: '',
  playingRole: '',
  heightValue: '',
  heightUnit: '',
  weightValue: '',
  weightUnit: '',
  gender: '',
  consentAccepted: false,
};

function fromProfile(p: ProfileDto): FormState {
  return {
    phone: p.phone ?? '',
    school: p.school ?? '',
    emergencyContactName: p.emergencyContactName ?? '',
    emergencyContactPhone: p.emergencyContactPhone ?? '',
    jerseyNumber: p.jerseyNumber != null ? String(p.jerseyNumber) : '',
    jerseyName: p.jerseyName ?? '',
    jerseySize: p.jerseySize ?? '',
    battingStyle: p.battingStyle ?? '',
    battingStyleOther: p.battingStyleOther ?? '',
    bowlingStyle: p.bowlingStyle ?? '',
    bowlingStyleOther: p.bowlingStyleOther ?? '',
    playingRole: p.playingRole ?? '',
    heightValue: p.heightValue != null ? String(p.heightValue) : '',
    heightUnit: p.heightUnit ?? '',
    weightValue: p.weightValue != null ? String(p.weightValue) : '',
    weightUnit: p.weightUnit ?? '',
    gender: p.gender ?? '',
    consentAccepted: false,
  };
}

function toPayload(f: FormState) {
  return {
    phone: f.phone.trim(),
    school: f.school.trim(),
    emergencyContactName: f.emergencyContactName.trim(),
    emergencyContactPhone: f.emergencyContactPhone.trim(),
    jerseyNumber: f.jerseyNumber.trim() === '' ? undefined : Number(f.jerseyNumber),
    jerseyName: f.jerseyName.trim(),
    jerseySize: f.jerseySize || undefined,
    battingStyle: f.battingStyle || null,
    battingStyleOther: f.battingStyle === 'other' ? f.battingStyleOther.trim() || null : null,
    bowlingStyle: f.bowlingStyle || null,
    bowlingStyleOther: f.bowlingStyle === 'other' ? f.bowlingStyleOther.trim() || null : null,
    playingRole: f.playingRole || null,
    heightValue: f.heightValue.trim() === '' ? null : Number(f.heightValue),
    heightUnit: f.heightUnit || null,
    weightValue: f.weightValue.trim() === '' ? null : Number(f.weightValue),
    weightUnit: f.weightUnit || null,
    gender: f.gender || null,
    consentAccepted: f.consentAccepted,
  };
}

const STEP_FIELD_KEYS: (keyof FormState)[][] = [
  ['phone', 'school', 'emergencyContactName', 'emergencyContactPhone'],
  ['jerseyNumber', 'jerseyName', 'jerseySize'],
  [
    'battingStyle',
    'battingStyleOther',
    'bowlingStyle',
    'bowlingStyleOther',
    'playingRole',
    'heightValue',
    'heightUnit',
    'weightValue',
    'weightUnit',
    'gender',
  ],
  ['consentAccepted'],
];

function labelOr(value: string, labels: Record<string, string>): string {
  return labels[value] ?? value;
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </span>
      {children}
      {error ? (
        <span className={styles.fieldError}>{error}</span>
      ) : hint ? (
        <span className={styles.hint}>{hint}</span>
      ) : null}
    </label>
  );
}

function CricketProfileWizard({
  title,
  subtitle,
  loadUrl,
  saveUrl,
  backTo,
  backLabel,
  onSaved,
}: {
  title: string;
  subtitle: string;
  loadUrl: string;
  saveUrl: string;
  backTo: string;
  backLabel: string;
  onSaved(profile: ProfileDto): void;
}) {
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ profile: ProfileDto }>(loadUrl);
      setProfile(data.profile);
      setForm(fromProfile(data.profile));
    } catch (err) {
      setLoadError(errorsFrom(err).banner);
    }
  }, [loadUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateStep(index: number): boolean {
    const parsed = validateForm(sportsProfileSchema, toPayload(form));
    const keys = STEP_FIELD_KEYS[index] ?? [];
    setFields((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        const message = parsed.ok ? undefined : parsed.fields[k];
        if (message !== undefined) next[k] = message;
        else delete next[k];
      }
      return next;
    });
    return parsed.ok || !keys.some((k) => k in parsed.fields);
  }

  function goNext() {
    setBanner(null);
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function goBack() {
    setBanner(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    setBanner(null);
    const parsed = validateForm(sportsProfileSchema, toPayload(form));
    if (!parsed.ok) {
      setFields(parsed.fields);
      const erroredKeys = Object.keys(parsed.fields);
      const firstStep = STEP_FIELD_KEYS.findIndex((keys) =>
        keys.some((k) => erroredKeys.includes(k)),
      );
      if (firstStep >= 0) setStep(firstStep);
      return;
    }
    setFields({});
    setSaving(true);
    try {
      const data = await api<{ profile: ProfileDto }>(saveUrl, {
        method: 'PATCH',
        body: parsed.data,
      });
      onSaved(data.profile);
    } catch (err) {
      const e = errorsFrom(err);
      setFields(e.fields);
      setBanner(e.banner);
      if (e.banner && /jersey number/i.test(e.banner)) setStep(1);
    } finally {
      setSaving(false);
    }
  }

  if (!profile && !loadError) {
    return (
      <div className={styles.page}>
        <section className={styles.panel}>
          <p className={styles.deck}>Loading…</p>
        </section>
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className={styles.page}>
        <section className={styles.panel}>
          <p className={styles.bannerError} role="alert">
            {loadError ?? 'Something went wrong.'}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label={title}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>{title}</h2>
            <p className={styles.deck}>{subtitle}</p>
          </div>
          <Link to={backTo} className={styles.backLink}>
            {backLabel}
          </Link>
        </header>

        <ol className={styles.stepper} aria-label="Steps">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={[
                styles.step,
                i === step ? styles.stepActive : '',
                i < step ? styles.stepDone : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.stepDot}>
                {i < step ? <Icon name="shield-check" size={12} /> : i + 1}
              </span>
              <span className={styles.stepLabel}>{label}</span>
            </li>
          ))}
        </ol>

        {banner && (
          <p className={styles.bannerError} role="alert">
            {banner}
          </p>
        )}

        <div className={styles.stepBody}>
          {step === 0 && (
            <div className={styles.fields}>
              <Field
                label="Phone number"
                hint="Private, used by organizers to reach you, never shown publicly. 10 digits, numbers only."
                required
                error={fields['phone']}
              >
                <input
                  type="tel"
                  inputMode="numeric"
                  className={styles.input}
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  maxLength={10}
                  autoComplete="tel"
                />
              </Field>
              <Field
                label="School"
                hint="Shown on your public player profile."
                required
                error={fields['school']}
              >
                <input
                  type="text"
                  className={styles.input}
                  value={form.school}
                  onChange={(e) => set('school', e.target.value)}
                  maxLength={50}
                />
              </Field>
              <Field
                label="Emergency contact name"
                hint="Private, for organizer use only."
                required
                error={fields['emergencyContactName']}
              >
                <input
                  type="text"
                  className={styles.input}
                  value={form.emergencyContactName}
                  onChange={(e) => set('emergencyContactName', e.target.value)}
                  maxLength={50}
                />
              </Field>
              <Field
                label="Emergency contact phone"
                hint="Private, for organizer use only. 10 digits, numbers only."
                required
                error={fields['emergencyContactPhone']}
              >
                <input
                  type="tel"
                  inputMode="numeric"
                  className={styles.input}
                  value={form.emergencyContactPhone}
                  onChange={(e) =>
                    set('emergencyContactPhone', e.target.value.replace(/\D/g, '').slice(0, 10))
                  }
                  maxLength={10}
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className={styles.fields}>
              <Field
                label="Jersey number"
                hint="0-99. If a teammate already has this number, you'll be asked to pick another."
                required
                error={fields['jerseyNumber']}
              >
                <input
                  type="number"
                  min={0}
                  max={99}
                  className={styles.input}
                  value={form.jerseyNumber}
                  onChange={(e) => set('jerseyNumber', e.target.value)}
                />
              </Field>
              <Field
                label="Jersey display name"
                hint="The name printed on the back of the jersey."
                required
                error={fields['jerseyName']}
              >
                <input
                  type="text"
                  className={styles.input}
                  value={form.jerseyName}
                  onChange={(e) => set('jerseyName', e.target.value)}
                  maxLength={20}
                />
              </Field>
              <Field label="Jersey size" required error={fields['jerseySize']}>
                <select
                  className={styles.input}
                  value={form.jerseySize}
                  onChange={(e) => set('jerseySize', e.target.value as JerseySize | '')}
                >
                  <option value="">Not set</option>
                  {JERSEY_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {JERSEY_SIZE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className={styles.fields}>
              <Field label="Batting style" error={fields['battingStyleOther']}>
                <select
                  className={styles.input}
                  value={form.battingStyle}
                  onChange={(e) => set('battingStyle', e.target.value as BattingStyle | '')}
                >
                  <option value="">Not set</option>
                  {BATTING_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {BATTING_STYLE_LABELS[s]}
                    </option>
                  ))}
                </select>
                {form.battingStyle === 'other' && (
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Describe your batting style"
                    value={form.battingStyleOther}
                    onChange={(e) => set('battingStyleOther', e.target.value)}
                    maxLength={60}
                  />
                )}
              </Field>
              <Field label="Bowling style" error={fields['bowlingStyleOther']}>
                <select
                  className={styles.input}
                  value={form.bowlingStyle}
                  onChange={(e) => set('bowlingStyle', e.target.value as BowlingStyle | '')}
                >
                  <option value="">Not set</option>
                  {BOWLING_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {BOWLING_STYLE_LABELS[s]}
                    </option>
                  ))}
                </select>
                {form.bowlingStyle === 'other' && (
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Describe your bowling style"
                    value={form.bowlingStyleOther}
                    onChange={(e) => set('bowlingStyleOther', e.target.value)}
                    maxLength={60}
                  />
                )}
              </Field>
              <Field label="Playing role">
                <select
                  className={styles.input}
                  value={form.playingRole}
                  onChange={(e) => set('playingRole', e.target.value as PlayingRole | '')}
                >
                  <option value="">Not set</option>
                  {PLAYING_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {PLAYING_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Height" error={fields['heightUnit']}>
                <div className={styles.compoundRow}>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    className={styles.input}
                    value={form.heightValue}
                    onChange={(e) => set('heightValue', e.target.value)}
                  />
                  <select
                    className={styles.unitSelect}
                    value={form.heightUnit}
                    onChange={(e) => set('heightUnit', e.target.value as HeightUnit | '')}
                    aria-label="Height unit"
                  >
                    <option value="">Unit</option>
                    {HEIGHT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {HEIGHT_UNIT_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field label="Weight" error={fields['weightUnit']}>
                <div className={styles.compoundRow}>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    className={styles.input}
                    value={form.weightValue}
                    onChange={(e) => set('weightValue', e.target.value)}
                  />
                  <select
                    className={styles.unitSelect}
                    value={form.weightUnit}
                    onChange={(e) => set('weightUnit', e.target.value as WeightUnit | '')}
                    aria-label="Weight unit"
                  >
                    <option value="">Unit</option>
                    {WEIGHT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {WEIGHT_UNIT_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field label="Gender" required error={fields['gender']}>
                <select
                  className={styles.input}
                  value={form.gender}
                  onChange={(e) => set('gender', e.target.value as Gender | '')}
                >
                  <option value="">Select gender</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {GENDER_LABELS[g]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className={styles.reviewBlock}>
              <div className={styles.summaryGrid}>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>School</span>
                  <span className={styles.summaryValue}>{form.school || '-'}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Jersey</span>
                  <span className={styles.summaryValue}>
                    {form.jerseyNumber ? `#${form.jerseyNumber}` : '-'}
                    {form.jerseyName ? ` "${form.jerseyName}"` : ''}
                    {form.jerseySize ? ` · ${labelOr(form.jerseySize, JERSEY_SIZE_LABELS)}` : ''}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Batting</span>
                  <span className={styles.summaryValue}>
                    {form.battingStyle
                      ? battingStyleLabel(form.battingStyle, form.battingStyleOther)
                      : '-'}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Bowling</span>
                  <span className={styles.summaryValue}>
                    {form.bowlingStyle
                      ? bowlingStyleLabel(form.bowlingStyle, form.bowlingStyleOther)
                      : '-'}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Role</span>
                  <span className={styles.summaryValue}>
                    {form.playingRole ? labelOr(form.playingRole, PLAYING_ROLE_LABELS) : '-'}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Height</span>
                  <span className={styles.summaryValue}>
                    {form.heightValue && form.heightUnit
                      ? `${form.heightValue} ${HEIGHT_UNIT_LABELS[form.heightUnit]}`
                      : '-'}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Weight</span>
                  <span className={styles.summaryValue}>
                    {form.weightValue && form.weightUnit
                      ? `${form.weightValue} ${WEIGHT_UNIT_LABELS[form.weightUnit]}`
                      : '-'}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Gender</span>
                  <span className={styles.summaryValue}>
                    {form.gender ? labelOr(form.gender, GENDER_LABELS) : '-'}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Phone</span>
                  <span className={styles.summaryValue}>{form.phone || '-'}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Emergency contact</span>
                  <span className={styles.summaryValue}>
                    {form.emergencyContactName || form.emergencyContactPhone
                      ? `${form.emergencyContactName || '-'} · ${form.emergencyContactPhone || '-'}`
                      : '-'}
                  </span>
                </div>
              </div>

              <div className={styles.consentDoc}>
                <h3 className={styles.consentTitle}>
                  NForce Arena Participant Consent &amp; Release
                </h3>
                <p className={styles.consentIntro}>
                  I, the undersigned, acknowledge that participation in cricket tournaments involves
                  physical activity that may result in injury. By confirming this profile, I agree
                  to the following:
                </p>
                <ol className={styles.consentList}>
                  <li>
                    I confirm this player is medically fit to participate in cricket activities.
                  </li>
                  <li>I authorize tournament staff to seek medical attention if required.</li>
                  <li>
                    I release NForce Arena, organizers, and venues from liability for injuries
                    sustained during participation.
                  </li>
                  <li>
                    I consent to photographs and videos being taken during the tournament for
                    promotional purposes.
                  </li>
                  <li>
                    I confirm the player's age group eligibility as stated in their registration.
                  </li>
                  <li>
                    I agree to the tournament's code of conduct for players, parents, and
                    spectators.
                  </li>
                  <li>
                    I understand entry fees are non-refundable unless the tournament is cancelled by
                    the organizer.
                  </li>
                </ol>
              </div>

              <label className={styles.consentCheck}>
                <input
                  type="checkbox"
                  checked={form.consentAccepted}
                  onChange={(e) => set('consentAccepted', e.target.checked)}
                />
                <span>
                  I have read and agree to the Participant Consent &amp; Release above, and confirm
                  the details I've entered are accurate.
                </span>
              </label>
              {fields['consentAccepted'] && (
                <p className={styles.fieldError}>{fields['consentAccepted']}</p>
              )}
            </div>
          )}
        </div>

        <div className={styles.wizardActions}>
          <button type="button" className={styles.backBtn} onClick={goBack} disabled={step === 0}>
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className={styles.nextBtn} onClick={goNext}>
              Next
              <Icon name="chevron-right" size={16} />
            </button>
          ) : (
            <button
              type="button"
              className={styles.save}
              onClick={() => void submit()}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Confirm & save'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function DashboardCricketProfilePage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  return (
    <CricketProfileWizard
      title="Cricket profile"
      subtitle="Contact, jersey, and playing style, shown on your public player profile, except phone and emergency contact, which stay private."
      loadUrl="/api/me/profile"
      saveUrl="/api/me/sports-profile"
      backTo="/profile"
      backLabel="Back to profile"
      onSaved={async () => {
        await refreshUser();
        navigate(user ? `/players/${user.id}` : '/profile');
      }}
    />
  );
}

export function DashboardChildCricketProfilePage() {
  const { childId } = useParams<{ childId: string }>();
  const navigate = useNavigate();
  if (!childId) return null;
  return (
    <CricketProfileWizard
      title="Child's cricket profile"
      subtitle="Fill this in on your child's behalf, and sign the participant consent as their guardian."
      loadUrl={`/api/parent/children/${childId}/sports-profile`}
      saveUrl={`/api/parent/children/${childId}/sports-profile`}
      backTo="/parent"
      backLabel="Back to my children"
      onSaved={() => navigate('/parent')}
    />
  );
}
