import type { AgeGroupDto, SurfaceTypeDto } from '@nforce/shared';
import {
  ALLOWED_RULES_DOCUMENT_TYPES,
  MAX_RULES_DOCUMENT_BYTES,
  TOURNAMENT_GENDER_CATEGORY_LABELS,
} from '@nforce/shared';
import { useState, type ChangeEvent, type ReactNode } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { DateField } from '../../DateField';
import { MonthYearField } from '../../MonthYearField';
import { StateField } from '../../StateField';
import { api } from '../../../lib/apiClient';
import { errorsFrom, type FieldErrors } from '../../../lib/forms';
import { todayISODate, wallDay } from '../../../lib/calendar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon, type IconName } from '../ui/Icon';
import {
  FIELD_TO_STEP_INDEX,
  GENDER_CATEGORY_OPTIONS,
  NOTIFY_AUDIENCE_OPTIONS,
  TEAM_SELECTION_MODE_OPTIONS,
  TOURNAMENT_STRUCTURE_OPTIONS,
  WIZARD_STEPS,
  defaultAgeGroupDetail,
  type AgeGroupDetailValues,
  type TournamentWizardValues,
} from './OrganizerTournamentWizardShared';
import pageStyles from './OrganizerTournamentsPage.module.css';
import styles from './OrganizerTournamentWizard.module.css';

export interface StepProps {
  values: TournamentWizardValues;
  errors: FieldErrors;
  onChange: (patch: Partial<TournamentWizardValues>) => void;
}

function RequiredMark() {
  return (
    <span className={pageStyles.requiredMark} aria-hidden="true">
      {' '}
      *
    </span>
  );
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
    <label className={pageStyles.field}>
      <span className={pageStyles.label}>
        {label}
        {required && <RequiredMark />}
      </span>
      {children}
      {error ? (
        <p className={pageStyles.fieldError}>{error}</p>
      ) : (
        hint && <p className={pageStyles.fieldHint}>{hint}</p>
      )}
    </label>
  );
}

export function BasicsStep({ values, errors, onChange }: StepProps) {
  return (
    <>
      <Field label="Tournament name" error={errors['name']} required>
        <input
          className={pageStyles.input}
          placeholder="Tournament name"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>
      <Field label="Description (optional)" error={errors['description']}>
        <textarea
          className={pageStyles.input}
          rows={3}
          placeholder="What should players and managers know about this tournament?"
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>
      <div className={pageStyles.field}>
        <span className={pageStyles.label}>
          Tournament structure
          <RequiredMark />
        </span>
        <div className={styles.optionGrid} role="radiogroup" aria-label="Tournament structure">
          {TOURNAMENT_STRUCTURE_OPTIONS.map((opt) => {
            const isSelected = values.structure === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`${styles.optionTile ?? ''} ${isSelected ? (styles.optionTileActive ?? '') : ''}`}
                onClick={() => onChange({ structure: opt.id })}
              >
                <span className={styles.optionTitle}>{opt.label}</span>
                <p className={styles.optionDescription}>{opt.description}</p>
              </button>
            );
          })}
        </div>
        {errors['structure'] && <p className={pageStyles.fieldError}>{errors['structure']}</p>}
      </div>

      <div className={pageStyles.formGrid}>
        <Field label="City" error={errors['locationCity']} required>
          <input
            className={pageStyles.input}
            placeholder="e.g. Dallas"
            value={values.locationCity}
            onChange={(e) => onChange({ locationCity: e.target.value })}
          />
        </Field>
        <Field label="State" error={errors['locationState']} required>
          <StateField
            value={values.locationState}
            onChange={(v) => onChange({ locationState: v })}
            ariaLabel="State"
          />
        </Field>
      </div>
    </>
  );
}

export function SetupScheduleStep({
  values,
  errors,
  onChange,
  surfaceTypesCatalog,
  onSurfaceCatalogRefresh,
}: StepProps & {
  surfaceTypesCatalog: SurfaceTypeDto[];
  onSurfaceCatalogRefresh: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [newSurfaceName, setNewSurfaceName] = useState('');
  const [creatingSurface, setCreatingSurface] = useState(false);
  const [deletingSurfaceId, setDeletingSurfaceId] = useState<string | null>(null);
  const [surfaceBanner, setSurfaceBanner] = useState<string | null>(null);
  const [surfaceDeleteTarget, setSurfaceDeleteTarget] = useState<SurfaceTypeDto | null>(null);

  async function createSurfaceType() {
    const name = newSurfaceName.trim();
    if (!name) return;
    setSurfaceBanner(null);
    setCreatingSurface(true);
    try {
      const { surfaceType } = await api<{ surfaceType: SurfaceTypeDto }>('/api/surface-types', {
        body: { name },
      });
      setNewSurfaceName('');
      await onSurfaceCatalogRefresh();
      onChange({ surfaceTypeId: surfaceType.id });
    } catch (err) {
      setSurfaceBanner(errorsFrom(err).banner ?? 'Could not add that surface type.');
    } finally {
      setCreatingSurface(false);
    }
  }

  async function doDeleteSurfaceType(st: SurfaceTypeDto) {
    setSurfaceBanner(null);
    setDeletingSurfaceId(st.id);
    try {
      await api(`/api/surface-types/${st.id}`, { method: 'DELETE' });
      if (values.surfaceTypeId === st.id) onChange({ surfaceTypeId: '' });
      await onSurfaceCatalogRefresh();
    } catch (err) {
      setSurfaceBanner(errorsFrom(err).banner ?? 'Could not delete that surface type.');
    } finally {
      setDeletingSurfaceId(null);
    }
  }

  return (
    <>
      <div className={pageStyles.field}>
        <span className={pageStyles.label}>
          Team selection
          <RequiredMark />
        </span>
        <div className={styles.optionGrid} role="radiogroup" aria-label="Team selection mode">
          {TEAM_SELECTION_MODE_OPTIONS.map((opt) => {
            const isSelected = values.teamSelectionMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`${styles.optionTile ?? ''} ${isSelected ? (styles.optionTileActive ?? '') : ''}`}
                onClick={() => onChange({ teamSelectionMode: opt.id })}
              >
                <span className={styles.optionTitle}>{opt.label}</span>
                <p className={styles.optionDescription}>{opt.description}</p>
              </button>
            );
          })}
        </div>
        {errors['teamSelectionMode'] && (
          <p className={pageStyles.fieldError}>{errors['teamSelectionMode']}</p>
        )}
      </div>

      {values.teamSelectionMode === 'prebuilt_rosters' && (
        <Field label="Max marquee players per team (optional)" error={errors['maxMarqueePlayers']}>
          <input
            className={pageStyles.input}
            type="number"
            min={0}
            placeholder="No limit"
            value={values.maxMarqueePlayers}
            onChange={(e) => onChange({ maxMarqueePlayers: e.target.value })}
          />
        </Field>
      )}

      <div className={pageStyles.field}>
        <span className={pageStyles.label}>Surface type (optional)</span>
        {surfaceBanner && <p className={pageStyles.fieldError}>{surfaceBanner}</p>}
        <div className={styles.ageGroupCheckList}>
          {surfaceTypesCatalog.map((st) => {
            const selected = values.surfaceTypeId === st.id;
            const isMine = st.organizerId != null && st.organizerId === user?.id;
            return (
              <label key={st.id} className={styles.ageGroupCheckRow}>
                <input
                  type="radio"
                  name="surfaceType"
                  checked={selected}
                  onChange={() => onChange({ surfaceTypeId: selected ? '' : st.id })}
                />
                <span className={styles.ageGroupCheckName}>{st.name}</span>
                {isMine && (
                  <button
                    type="button"
                    className={styles.ageGroupHideBtn}
                    disabled={deletingSurfaceId === st.id}
                    onClick={() => setSurfaceDeleteTarget(st)}
                    aria-label={`Delete ${st.name} from your surface type list`}
                    title="Delete from your list"
                  >
                    <Icon name="x" size={13} />
                  </button>
                )}
              </label>
            );
          })}
        </div>
        {errors['surfaceTypeId'] && (
          <p className={pageStyles.fieldError}>{errors['surfaceTypeId']}</p>
        )}

        <div className={styles.ageGroupAddRow}>
          <input
            className={pageStyles.input}
            placeholder="Add a new surface type (e.g. Astro Turf)"
            value={newSurfaceName}
            onChange={(e) => setNewSurfaceName(e.target.value)}
          />
          <button
            type="button"
            className={pageStyles.submit}
            disabled={creatingSurface || !newSurfaceName.trim()}
            onClick={() => void createSurfaceType()}
          >
            {creatingSurface ? 'Adding…' : 'Add'}
          </button>
        </div>
        <p className={pageStyles.deck}>
          Added surface types are yours to reuse on future tournaments. Delete the ✕ next to one you
          no longer want; a surface type still used by a tournament can't be deleted.
        </p>
      </div>

      <div className={pageStyles.formGrid}>
        <Field label="Start date" error={errors['startDate']} required>
          <DateField
            ariaLabel="Start date"
            value={values.startDate}
            onChange={(v) => onChange({ startDate: v })}
            min={todayISODate()}
          />
        </Field>
        <Field label="End date" error={errors['endDate']} required>
          <DateField
            ariaLabel="End date"
            value={values.endDate}
            onChange={(v) => onChange({ endDate: v })}
            min={values.startDate || todayISODate()}
          />
        </Field>
      </div>

      <ConfirmDialog
        open={surfaceDeleteTarget !== null}
        title="Delete this surface type?"
        message={
          surfaceDeleteTarget
            ? `Delete "${surfaceDeleteTarget.name}" from your surface type list? A surface type still used by a tournament can't be deleted, but if this one's unused, it's gone for good.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (surfaceDeleteTarget) void doDeleteSurfaceType(surfaceDeleteTarget);
          setSurfaceDeleteTarget(null);
        }}
        onCancel={() => setSurfaceDeleteTarget(null)}
      />
    </>
  );
}

export function AgeGroupSelectStep({
  values,
  errors,
  onChange,
  ageGroupsCatalog,
  onCatalogRefresh,
}: StepProps & {
  ageGroupsCatalog: AgeGroupDto[];
  onCatalogRefresh: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [hidingId, setHidingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  function toggle(ageGroup: AgeGroupDto, checked: boolean) {
    const ids = checked
      ? [...values.ageGroupIds, ageGroup.id]
      : values.ageGroupIds.filter((id) => id !== ageGroup.id);
    const details = { ...values.ageGroupDetails };
    if (checked && !details[ageGroup.id]) {
      details[ageGroup.id] = defaultAgeGroupDetail(ageGroup);
    }
    onChange({ ageGroupIds: ids, ageGroupDetails: details });
  }

  async function hideAgeGroup(ag: AgeGroupDto) {
    setBanner(null);
    setHidingId(ag.id);
    try {
      await api(`/api/age-groups/${ag.id}/hidden`, { method: 'PATCH', body: { hidden: true } });
      if (values.ageGroupIds.includes(ag.id)) toggle(ag, false);
      await onCatalogRefresh();
    } catch (err) {
      setBanner(errorsFrom(err).banner ?? 'Could not hide that age group.');
    } finally {
      setHidingId(null);
    }
  }

  return (
    <div className={pageStyles.field}>
      <span className={pageStyles.label}>
        Which age groups is this tournament open to?
        <RequiredMark />
      </span>
      {banner && <p className={pageStyles.fieldError}>{banner}</p>}
      <div className={styles.ageGroupCheckList}>
        {ageGroupsCatalog.map((ag) => {
          const checked = values.ageGroupIds.includes(ag.id);
          const isMine = ag.organizerId != null && ag.organizerId === user?.id;
          return (
            <label key={ag.id} className={styles.ageGroupCheckRow}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => toggle(ag, e.target.checked)}
              />
              <span className={styles.ageGroupCheckName}>{ag.name}</span>
              {isMine && (
                <button
                  type="button"
                  className={styles.ageGroupHideBtn}
                  disabled={hidingId === ag.id}
                  onClick={() => void hideAgeGroup(ag)}
                  aria-label={`Hide ${ag.name} from your age group list`}
                  title="Hide from your list"
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </label>
          );
        })}
      </div>
      {errors['ageGroupIds'] && <p className={pageStyles.fieldError}>{errors['ageGroupIds']}</p>}
    </div>
  );
}

export function AgeGroupDetailsStep({
  values,
  errors,
  onChange,
  ageGroupsCatalog,
}: {
  values: TournamentWizardValues;
  errors: Record<string, FieldErrors>;
  onChange: (patch: Partial<TournamentWizardValues>) => void;
  ageGroupsCatalog: AgeGroupDto[];
}) {
  function updateDetail(ageGroupId: string, patch: Partial<AgeGroupDetailValues>) {
    onChange({
      ageGroupDetails: {
        ...values.ageGroupDetails,
        [ageGroupId]: { ...values.ageGroupDetails[ageGroupId]!, ...patch },
      },
    });
  }

  return (
    <>
      {values.ageGroupIds.map((ageGroupId) => {
        const catalogEntry = ageGroupsCatalog.find((ag) => ag.id === ageGroupId);
        const detail = values.ageGroupDetails[ageGroupId];
        if (!catalogEntry || !detail) return null;
        const cardErrors = errors[ageGroupId] ?? {};
        const defaultRange =
          catalogEntry.minAge != null || catalogEntry.maxAge != null
            ? `Global default: ${catalogEntry.minAge ?? '0'}–${catalogEntry.maxAge ?? '∞'}`
            : 'Global default: no age limit';

        return (
          <div key={ageGroupId} className={styles.ageGroupCard}>
            <div className={styles.ageGroupCardHead}>
              <h4 className={styles.ageGroupCardTitle}>{catalogEntry.name}</h4>
              <span className={styles.ageGroupCardDefault}>{defaultRange}</span>
            </div>
            <div className={pageStyles.ageGroupDetailsGrid}>
              <Field
                label="Registration start date"
                error={cardErrors.registrationStartDate}
                required
              >
                <DateField
                  ariaLabel={`${catalogEntry.name} registration start date`}
                  value={detail.registrationStartDate}
                  onChange={(v) => updateDetail(ageGroupId, { registrationStartDate: v })}
                  min={todayISODate()}
                  max={values.endDate || undefined}
                />
              </Field>
              <Field label="Registration end date" error={cardErrors.registrationEndDate} required>
                <DateField
                  ariaLabel={`${catalogEntry.name} registration end date`}
                  value={detail.registrationEndDate}
                  onChange={(v) => updateDetail(ageGroupId, { registrationEndDate: v })}
                  min={detail.registrationStartDate || todayISODate()}
                  max={values.endDate || undefined}
                />
              </Field>
              <Field label="Playing format" error={cardErrors.format} required>
                <input
                  className={pageStyles.input}
                  placeholder="Format (e.g. T20)"
                  value={detail.format}
                  onChange={(e) => updateDetail(ageGroupId, { format: e.target.value })}
                />
              </Field>
              <Field label="Overs per innings (optional)" error={cardErrors.oversPerInnings}>
                <input
                  className={pageStyles.input}
                  type="number"
                  min={1}
                  placeholder="Not specified"
                  value={detail.oversPerInnings}
                  onChange={(e) => updateDetail(ageGroupId, { oversPerInnings: e.target.value })}
                />
              </Field>
              <Field label="Born before (optional)" error={cardErrors.bornBefore}>
                <MonthYearField
                  ariaLabel={`${catalogEntry.name} born before`}
                  placeholder="No maximum"
                  value={detail.bornBefore}
                  onChange={(v) => updateDetail(ageGroupId, { bornBefore: v })}
                  min={detail.bornAfter || undefined}
                  max={todayISODate().slice(0, 7)}
                  clearable
                />
              </Field>
              <Field label="Born after (optional)" error={cardErrors.bornAfter}>
                <MonthYearField
                  ariaLabel={`${catalogEntry.name} born after`}
                  placeholder="No minimum"
                  value={detail.bornAfter}
                  onChange={(v) => updateDetail(ageGroupId, { bornAfter: v })}
                  max={detail.bornBefore || todayISODate().slice(0, 7)}
                  clearable
                />
              </Field>
              <Field
                label={
                  values.teamSelectionMode === 'draft_based'
                    ? 'Player slots (optional)'
                    : 'Team slots (optional)'
                }
                error={cardErrors.capacity}
              >
                <input
                  className={pageStyles.input}
                  type="number"
                  min={0}
                  placeholder="No limit"
                  value={detail.capacity}
                  onChange={(e) => updateDetail(ageGroupId, { capacity: e.target.value })}
                />
              </Field>
              <Field
                label={
                  values.teamSelectionMode === 'draft_based'
                    ? 'Entry fee, per player (optional)'
                    : 'Entry fee, per team (optional)'
                }
                error={cardErrors.entryFee}
              >
                <input
                  className={pageStyles.input}
                  type="number"
                  min={0}
                  placeholder="No fee"
                  value={detail.entryFee}
                  onChange={(e) => updateDetail(ageGroupId, { entryFee: e.target.value })}
                />
              </Field>
              <Field label="Gender category" error={cardErrors.genderCategory} required>
                <select
                  className={pageStyles.select}
                  value={detail.genderCategory}
                  onChange={(e) =>
                    updateDetail(ageGroupId, {
                      genderCategory: e.target.value as AgeGroupDetailValues['genderCategory'],
                    })
                  }
                >
                  <option value="">Choose…</option>
                  {GENDER_CATEGORY_OPTIONS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        );
      })}
    </>
  );
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function ExtrasStep({ values, errors, onChange }: StepProps) {
  const [fileError, setFileError] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileError(null);
    if (!(ALLOWED_RULES_DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
      setFileError('Use a PDF or plain text file.');
      return;
    }
    if (file.size > MAX_RULES_DOCUMENT_BYTES) {
      setFileError(`Max size is ${Math.floor(MAX_RULES_DOCUMENT_BYTES / (1024 * 1024))} MB.`);
      return;
    }
    const data = await readAsBase64(file);
    onChange({ rulesDocumentFile: { contentType: file.type, data, fileName: file.name } });
  }

  return (
    <>
      <div className={pageStyles.formGrid}>
        <Field label="Prize pool amount (optional)" error={errors['prizePoolAmount']}>
          <input
            className={pageStyles.input}
            type="number"
            min={0}
            placeholder="No cash prize"
            value={values.prizePoolAmount}
            onChange={(e) => onChange({ prizePoolAmount: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Prize pool note (optional)" error={errors['prizePoolDescription']}>
        <textarea
          className={pageStyles.input}
          rows={2}
          placeholder="e.g. Trophy + medals for top 3 teams"
          value={values.prizePoolNote}
          onChange={(e) => onChange({ prizePoolNote: e.target.value })}
        />
      </Field>
      <Field label="Rules (optional)" error={errors['rules']}>
        <textarea
          className={pageStyles.input}
          rows={4}
          placeholder="Any house rules for this tournament"
          value={values.rules}
          onChange={(e) => onChange({ rules: e.target.value })}
        />
      </Field>
      <div className={pageStyles.field}>
        <span className={pageStyles.label}>Rules document (optional)</span>
        {values.rulesDocumentFile ? (
          <div className={styles.ageGroupCheckRow}>
            <span className={styles.ageGroupCheckName}>{values.rulesDocumentFile.fileName}</span>
            <button
              type="button"
              className={styles.ageGroupHideBtn}
              onClick={() => onChange({ rulesDocumentFile: null })}
              aria-label="Remove attached rules document"
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        ) : values.existingRulesDocumentUrl ? (
          <div className={styles.ageGroupCheckRow}>
            <a
              className={styles.ageGroupCheckName}
              href={values.existingRulesDocumentUrl}
              target="_blank"
              rel="noreferrer"
            >
              Current document
            </a>
            <button
              type="button"
              className={styles.ageGroupHideBtn}
              onClick={() =>
                onChange({ existingRulesDocumentUrl: null, removeRulesDocument: true })
              }
              aria-label="Remove the current rules document"
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        ) : (
          <input
            className={pageStyles.input}
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            onChange={(e) => void handleFile(e)}
          />
        )}
        {fileError && <p className={pageStyles.fieldError}>{fileError}</p>}
        <p className={pageStyles.deck}>
          Attach a PDF or text file alongside the rules above. Players will be able to download it
          from the tournament page.
        </p>
      </div>
      <label className={styles.ageGroupCheckRow}>
        <input
          type="checkbox"
          checked={values.notifyOnPublish}
          onChange={(e) => onChange({ notifyOnPublish: e.target.checked })}
        />
        <span className={styles.ageGroupCheckName}>
          Notify players & team managers when published
        </span>
      </label>
      <p className={pageStyles.deck}>
        Sent once you publish this tournament, not now, since a new tournament always starts as a
        draft nobody else can see yet.
      </p>
      {values.notifyOnPublish && (
        <div className={pageStyles.field}>
          <span className={pageStyles.label}>Who to notify</span>
          <div className={styles.ageGroupCheckList}>
            {NOTIFY_AUDIENCE_OPTIONS.map((opt) => {
              const checked = values.notifyAudiences.includes(opt.id);
              return (
                <label key={opt.id} className={styles.ageGroupCheckRow}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      if (opt.id === 'everyone') {
                        onChange({ notifyAudiences: checked ? [] : ['everyone'] });
                        return;
                      }
                      const withoutEveryone = values.notifyAudiences.filter(
                        (a) => a !== 'everyone',
                      );
                      onChange({
                        notifyAudiences: checked
                          ? withoutEveryone.filter((a) => a !== opt.id)
                          : [...withoutEveryone, opt.id],
                      });
                    }}
                  />
                  <span className={styles.ageGroupCheckName}>{opt.label}</span>
                </label>
              );
            })}
          </div>
          {errors['notifyAudiences'] && (
            <p className={pageStyles.fieldError}>{errors['notifyAudiences']}</p>
          )}
        </div>
      )}
      {values.notifyOnPublish && values.notifyAudiences.includes('state') && (
        <Field label="State" error={errors['notifyState']} required>
          <StateField
            value={values.notifyState}
            onChange={(v) => onChange({ notifyState: v })}
            ariaLabel="State to notify"
          />
        </Field>
      )}
    </>
  );
}

function reviewDate(iso: string): string {
  return iso ? wallDay(iso) : '-';
}

const REVIEW_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function reviewMonth(value: string): string {
  const [y, m] = value.split('-').map(Number);
  return `${REVIEW_MONTHS[(m ?? 1) - 1] ?? ''} ${y}`.trim();
}

function ReviewCard({
  icon,
  title,
  onEdit,
  children,
}: {
  icon: IconName;
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.reviewCard}>
      <div className={styles.reviewCardHead}>
        <span className={styles.reviewCardIcon} aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        <h4 className={styles.reviewCardTitle}>{title}</h4>
        <button type="button" className={styles.reviewEditLink} onClick={onEdit}>
          Edit
        </button>
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.reviewRow}>
      <span className={styles.reviewLabel}>{label}</span>
      <span className={styles.reviewValue}>{value}</span>
    </div>
  );
}

export function ReviewStep({
  values,
  ageGroupsCatalog,
  surfaceTypesCatalog,
  onJump,
}: {
  values: TournamentWizardValues;
  ageGroupsCatalog: AgeGroupDto[];
  surfaceTypesCatalog: SurfaceTypeDto[];
  onJump: (index: number) => void;
}) {
  const structureLabel = TOURNAMENT_STRUCTURE_OPTIONS.find((o) => o.id === values.structure)?.label;
  const teamSelectionLabel = TEAM_SELECTION_MODE_OPTIONS.find(
    (o) => o.id === values.teamSelectionMode,
  )?.label;
  const surfaceTypeName = surfaceTypesCatalog.find((st) => st.id === values.surfaceTypeId)?.name;
  const location = [values.locationCity, values.locationState].filter(Boolean).join(', ');
  const slotLabel = values.teamSelectionMode === 'draft_based' ? 'Player slots' : 'Team slots';
  const feeWord = values.teamSelectionMode === 'draft_based' ? 'per player' : 'per team';

  const notifyValue = values.notifyOnPublish ? (
    <>
      {values.notifyAudiences
        .map((a) => NOTIFY_AUDIENCE_OPTIONS.find((o) => o.id === a)?.label ?? a)
        .join(', ')}
      {values.notifyAudiences.includes('state') && values.notifyState
        ? ` (${values.notifyState})`
        : ''}
    </>
  ) : (
    'No one'
  );

  const rulesDocValue = values.rulesDocumentFile
    ? values.rulesDocumentFile.fileName
    : !values.removeRulesDocument && values.existingRulesDocumentUrl
      ? 'Kept'
      : values.removeRulesDocument
        ? 'Will be removed'
        : 'None';

  return (
    <>
      <div className={styles.reviewHero}>
        <span className={styles.reviewHeroBadge} aria-hidden="true">
          <Icon name="trophy" size={22} />
        </span>
        <div className={styles.reviewHeroText}>
          <h3 className={styles.reviewHeroName}>{values.name || 'This tournament'}</h3>
          <p className={styles.reviewHeroSub}>
            {structureLabel ?? 'Structure not set'}
            {location ? ` · ${location}` : ''}
          </p>
        </div>
      </div>
      {values.description && <p className={styles.reviewDescription}>{values.description}</p>}

      <div className={styles.reviewGrid}>
        <ReviewCard icon="clipboard" title={WIZARD_STEPS[0]!.label} onEdit={() => onJump(0)}>
          <ReviewRow label="Structure" value={structureLabel ?? 'Not set'} />
          <ReviewRow label="Location" value={location || 'Not set'} />
        </ReviewCard>

        <ReviewCard icon="calendar" title={WIZARD_STEPS[1]!.label} onEdit={() => onJump(1)}>
          <ReviewRow label="Team selection" value={teamSelectionLabel ?? 'Not set'} />
          <ReviewRow
            label="Dates"
            value={
              <span className="num">
                {reviewDate(values.startDate)} – {reviewDate(values.endDate)}
              </span>
            }
          />
          <ReviewRow label="Surface" value={surfaceTypeName ?? 'Not set'} />
          {values.teamSelectionMode === 'prebuilt_rosters' && values.maxMarqueePlayers ? (
            <ReviewRow
              label="Max marquee players"
              value={<span className="num">{values.maxMarqueePlayers}</span>}
            />
          ) : null}
        </ReviewCard>

        <ReviewCard icon="star" title={WIZARD_STEPS[4]!.label} onEdit={() => onJump(4)}>
          <ReviewRow
            label="Prize pool"
            value={
              values.prizePoolAmount ? (
                <span className="num">{values.prizePoolAmount}</span>
              ) : (
                'Not set'
              )
            }
          />
          <ReviewRow label="Rules text" value={values.rules ? 'Attached' : 'Not added'} />
          <ReviewRow label="Rules document" value={rulesDocValue} />
          <ReviewRow label="Notify on publish" value={notifyValue} />
        </ReviewCard>
      </div>

      <div className={styles.reviewCardHead} style={{ marginTop: 22 }}>
        <span className={styles.reviewCardIcon} aria-hidden="true">
          <Icon name="users" size={16} />
        </span>
        <h4 className={styles.reviewCardTitle}>Age groups</h4>
        <button type="button" className={styles.reviewEditLink} onClick={() => onJump(3)}>
          Edit
        </button>
      </div>
      <div className={styles.reviewAgeGroupGrid}>
        {values.ageGroupIds.map((id) => {
          const catalogEntry = ageGroupsCatalog.find((ag) => ag.id === id);
          const detail = values.ageGroupDetails[id];
          if (!catalogEntry || !detail) return null;
          const genderLabel = detail.genderCategory
            ? TOURNAMENT_GENDER_CATEGORY_LABELS[detail.genderCategory]
            : 'Not set';
          const birthWindow =
            detail.bornAfter || detail.bornBefore
              ? `${detail.bornAfter ? `After ${reviewMonth(detail.bornAfter)}` : 'Any time'}${
                  detail.bornBefore ? ` – Before ${reviewMonth(detail.bornBefore)}` : ''
                }`
              : null;
          return (
            <div key={id} className={styles.reviewAgeGroupCard}>
              <div className={styles.reviewAgeGroupHead}>
                <span className="chip">{catalogEntry.name}</span>
                <span className={styles.reviewAgeGroupFormat}>
                  {genderLabel} · {detail.format || 'Not set'}
                  {detail.oversPerInnings ? (
                    <>
                      {' '}
                      · <span className="num">{detail.oversPerInnings}</span> overs
                    </>
                  ) : null}
                </span>
              </div>
              <ReviewRow
                label="Registration"
                value={
                  <span className="num">
                    {reviewDate(detail.registrationStartDate)} –{' '}
                    {reviewDate(detail.registrationEndDate)}
                  </span>
                }
              />
              {birthWindow && <ReviewRow label="Born" value={birthWindow} />}
              <ReviewRow
                label="Entry fee"
                value={
                  detail.entryFee ? (
                    <>
                      <span className="num">{detail.entryFee}</span> {feeWord}
                    </>
                  ) : (
                    'Free'
                  )
                }
              />
              {detail.capacity ? (
                <ReviewRow
                  label={slotLabel}
                  value={<span className="num">{detail.capacity}</span>}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

export { FIELD_TO_STEP_INDEX };
