import type {
  AgeGroupDto,
  CreateTournamentInput,
  OrganizerTournamentDto,
  SurfaceTypeDto,
  UpdateTournamentInput,
} from '@nforce/shared';
import {
  createTournamentSchema,
  tournamentAgeGroupInputSchema,
  updateTournamentSchema,
  wizardAgeGroupSelectSchema,
  wizardBasicsFormatSchema,
  wizardExtrasSchema,
  wizardSetupScheduleSchema,
} from '@nforce/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../../lib/apiClient';
import { errorsFrom, validateForm, type FieldErrors } from '../../../lib/forms';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { PageTabs } from '../ui/PageTabs';
import { WizardSteps } from '../ui/WizardSteps';
import {
  AgeGroupDetailsStep,
  AgeGroupSelectStep,
  BasicsStep,
  ExtrasStep,
  ReviewStep,
  SetupScheduleStep,
} from './OrganizerTournamentWizardSteps';
import {
  FIELD_TO_STEP_INDEX,
  WIZARD_STEPS,
  emptyWizardValues,
  type TournamentWizardValues,
} from './OrganizerTournamentWizardShared';
import styles from './OrganizerTournamentsPage.module.css';
import wizardStyles from './OrganizerTournamentWizard.module.css';

const CREATE_TABS = [
  { to: '/organizer/tournaments', label: 'My Tournaments', end: true },
  { to: '/organizer/tournaments/new', label: 'Create Tournament' },
];

function buildPayload(values: TournamentWizardValues): CreateTournamentInput {
  return {
    name: values.name,
    description: values.description.trim() || null,
    structure: values.structure || 'round_robin',
    teamSelectionMode: values.teamSelectionMode || 'prebuilt_rosters',
    rules: values.rules.trim() || null,
    startDate: values.startDate,
    endDate: values.endDate,
    capacity: values.capacity === '' ? null : Number(values.capacity),
    prizePoolAmount: values.prizePoolAmount === '' ? null : Number(values.prizePoolAmount),
    prizePoolDescription: values.prizePoolNote.trim() || null,
    locationCity: values.locationCity.trim(),
    locationState: values.locationState.trim(),
    surfaceTypeId: values.surfaceTypeId || null,
    maxMarqueePlayers:
      values.teamSelectionMode === 'prebuilt_rosters' && values.maxMarqueePlayers !== ''
        ? Number(values.maxMarqueePlayers)
        : null,
    notifyOnPublish: values.notifyOnPublish,
    notifyAudiences: values.notifyAudiences,
    notifyState: values.notifyAudiences.includes('state') ? values.notifyState.trim() : null,
    ageGroups: values.ageGroupIds.map((id) => {
      const d = values.ageGroupDetails[id]!;
      return {
        ageGroupId: id,
        bornAfter: d.bornAfter || null,
        bornBefore: d.bornBefore || null,
        genderCategory: d.genderCategory || 'mixed',
        registrationStartDate: d.registrationStartDate,
        registrationEndDate: d.registrationEndDate,
        capacity: d.capacity === '' ? null : Number(d.capacity),
        format: d.format,
        entryFee: d.entryFee === '' ? null : Number(d.entryFee),
        oversPerInnings: d.oversPerInnings === '' ? null : Number(d.oversPerInnings),
      };
    }),
  };
}

export interface TournamentWizardProps {
  mode: 'create' | 'edit';
  tournamentId?: string;
  initialValues?: TournamentWizardValues;
}

export function TournamentWizard({ mode, tournamentId, initialValues }: TournamentWizardProps) {
  const navigate = useNavigate();
  const [ageGroupsCatalog, setAgeGroupsCatalog] = useState<AgeGroupDto[]>([]);
  const [surfaceTypesCatalog, setSurfaceTypesCatalog] = useState<SurfaceTypeDto[]>([]);
  const [values, setValues] = useState<TournamentWizardValues>(
    () => initialValues ?? emptyWizardValues(),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [furthestValidIndex, setFurthestValidIndex] = useState(
    mode === 'edit' ? WIZARD_STEPS.length - 1 : 0,
  );
  const [fields, setFields] = useState<FieldErrors>({});
  const [ageGroupFieldErrors, setAgeGroupFieldErrors] = useState<Record<string, FieldErrors>>({});
  const [submitBanner, setSubmitBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<false | 'draft' | 'publish'>(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const loadAgeGroupsCatalog = useCallback(async () => {
    try {
      const data = await api<{ ageGroups: AgeGroupDto[] }>('/api/age-groups');
      setAgeGroupsCatalog(data.ageGroups);
    } catch {
    }
  }, []);

  useEffect(() => {
    void loadAgeGroupsCatalog();
  }, [loadAgeGroupsCatalog]);

  const loadSurfaceTypesCatalog = useCallback(async () => {
    try {
      const data = await api<{ surfaceTypes: SurfaceTypeDto[] }>('/api/surface-types');
      setSurfaceTypesCatalog(data.surfaceTypes);
    } catch {
    }
  }, []);

  useEffect(() => {
    void loadSurfaceTypesCatalog();
  }, [loadSurfaceTypesCatalog]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [currentIndex]);

  function patch(p: Partial<TournamentWizardValues>) {
    setValues((v) => ({ ...v, ...p }));
  }

  function validateStep(index: number): boolean {
    setFields({});
    setAgeGroupFieldErrors({});
    if (index === 0) {
      const parsed = validateForm(wizardBasicsFormatSchema, {
        name: values.name,
        description: values.description.trim() || null,
        structure: values.structure || undefined,
        locationCity: values.locationCity.trim(),
        locationState: values.locationState.trim(),
      });
      if (!parsed.ok) {
        setFields(parsed.fields);
        return false;
      }
      return true;
    }
    if (index === 1) {
      const parsed = validateForm(wizardSetupScheduleSchema, {
        teamSelectionMode: values.teamSelectionMode || undefined,
        startDate: values.startDate,
        endDate: values.endDate,
        capacity: values.capacity === '' ? null : Number(values.capacity),
        surfaceTypeId: values.surfaceTypeId || null,
        maxMarqueePlayers:
          values.maxMarqueePlayers === '' ? null : Number(values.maxMarqueePlayers),
      });
      if (!parsed.ok) {
        setFields(parsed.fields);
        return false;
      }
      return true;
    }
    if (index === 2) {
      const parsed = validateForm(wizardAgeGroupSelectSchema, { ageGroupIds: values.ageGroupIds });
      if (!parsed.ok) {
        setFields(parsed.fields);
        return false;
      }
      return true;
    }
    if (index === 3) {
      let ok = true;
      const nextErrors: Record<string, FieldErrors> = {};
      for (const id of values.ageGroupIds) {
        const detail = values.ageGroupDetails[id];
        if (!detail) continue;
        const parsed = validateForm(tournamentAgeGroupInputSchema, {
          ageGroupId: id,
          bornAfter: detail.bornAfter || null,
          bornBefore: detail.bornBefore || null,
          genderCategory: detail.genderCategory || undefined,
          registrationStartDate: detail.registrationStartDate,
          registrationEndDate: detail.registrationEndDate,
          capacity: detail.capacity === '' ? null : Number(detail.capacity),
          format: detail.format,
          entryFee: detail.entryFee === '' ? null : Number(detail.entryFee),
          oversPerInnings: detail.oversPerInnings === '' ? null : Number(detail.oversPerInnings),
        });
        const fieldErrors = parsed.ok ? {} : parsed.fields;
        if (
          values.endDate &&
          detail.registrationEndDate &&
          new Date(detail.registrationEndDate) > new Date(values.endDate)
        ) {
          fieldErrors.registrationEndDate =
            'Registration end date must not be after the tournament end date';
        }
        if (!parsed.ok || fieldErrors.registrationEndDate) {
          ok = false;
          nextErrors[id] = fieldErrors;
        }
      }
      setAgeGroupFieldErrors(nextErrors);
      return ok;
    }
    if (index === 4) {
      const parsed = validateForm(wizardExtrasSchema, {
        prizePoolAmount: values.prizePoolAmount === '' ? null : Number(values.prizePoolAmount),
        prizePoolDescription: values.prizePoolNote.trim() || null,
        rules: values.rules.trim() || null,
        notifyOnPublish: values.notifyOnPublish,
        notifyAudiences: values.notifyAudiences,
        notifyState: values.notifyAudiences.includes('state') ? values.notifyState.trim() : null,
      });
      if (!parsed.ok) {
        setFields(parsed.fields);
        return false;
      }
      return true;
    }
    return true;
  }

  function next() {
    if (!validateStep(currentIndex)) return;
    const nextIndex = Math.min(currentIndex + 1, WIZARD_STEPS.length - 1);
    setCurrentIndex(nextIndex);
    setFurthestValidIndex((f) => Math.max(f, nextIndex));
  }

  function back() {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }

  async function syncRulesDocument(id: string) {
    if (values.rulesDocumentFile) {
      await api(`/api/tournaments/${id}/rules-document`, {
        method: 'PUT',
        body: {
          contentType: values.rulesDocumentFile.contentType,
          data: values.rulesDocumentFile.data,
        },
      });
    } else if (values.removeRulesDocument) {
      await api(`/api/tournaments/${id}/rules-document`, { method: 'DELETE' });
    }
  }

  async function submit(publish: boolean) {
    setSubmitBanner(null);
    const payload = buildPayload(values);

    if (mode === 'edit') {
      const parsed = validateForm<UpdateTournamentInput>(updateTournamentSchema, payload);
      if (!parsed.ok) {
        setFields(parsed.fields);
        const failingStep = Object.keys(parsed.fields)
          .map((key) => FIELD_TO_STEP_INDEX[key.split('.')[0]!])
          .find((s) => s !== undefined);
        setSubmitBanner('Some details need fixing before this can be saved.');
        if (failingStep !== undefined) setCurrentIndex(failingStep);
        return;
      }
      setSubmitting('draft');
      try {
        await api(`/api/tournaments/${tournamentId}`, { method: 'PATCH', body: parsed.data });
        try {
          await syncRulesDocument(tournamentId!);
        } catch {
        }
        navigate(`/organizer/tournaments/${tournamentId}`);
      } catch (err) {
        setSubmitBanner(errorsFrom(err).banner ?? 'Could not save these changes.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const parsed = validateForm(createTournamentSchema, payload);
    if (!parsed.ok) {
      setFields(parsed.fields);
      const failingStep = Object.keys(parsed.fields)
        .map((key) => FIELD_TO_STEP_INDEX[key.split('.')[0]!])
        .find((s) => s !== undefined);
      setSubmitBanner('Some details need fixing before this tournament can be created.');
      if (failingStep !== undefined) setCurrentIndex(failingStep);
      return;
    }
    setSubmitting(publish ? 'publish' : 'draft');
    try {
      const { tournament } = await api<{ tournament: OrganizerTournamentDto }>('/api/tournaments', {
        body: parsed.data,
      });
      if (values.rulesDocumentFile) {
        try {
          await api(`/api/tournaments/${tournament.id}/rules-document`, {
            method: 'PUT',
            body: {
              contentType: values.rulesDocumentFile.contentType,
              data: values.rulesDocumentFile.data,
            },
          });
        } catch {
          navigate(`/organizer/tournaments/${tournament.id}`);
          return;
        }
      }
      if (publish) {
        try {
          await api(`/api/tournaments/${tournament.id}/publish`, { method: 'POST' });
        } catch {
        }
      }
      navigate(`/organizer/tournaments/${tournament.id}`);
    } catch (err) {
      setSubmitBanner(errorsFrom(err).banner ?? 'Could not create the tournament.');
    } finally {
      setSubmitting(false);
    }
  }

  const step = WIZARD_STEPS[currentIndex]!;
  const isLastStep = currentIndex === WIZARD_STEPS.length - 1;

  return (
    <div className={styles.page}>
      {mode === 'create' && <PageTabs items={CREATE_TABS} />}

      <WizardSteps
        steps={WIZARD_STEPS}
        currentIndex={currentIndex}
        furthestValidIndex={furthestValidIndex}
        onJump={setCurrentIndex}
      />

      <p className="sr-only" aria-live="polite">
        Step {currentIndex + 1} of {WIZARD_STEPS.length}: {step.label}
      </p>

      <section className={styles.panel} aria-label={step.label}>
        <h2 className={styles.h2} ref={headingRef} tabIndex={-1}>
          {step.label}
        </h2>

        {step.id === 'basics' && <BasicsStep values={values} errors={fields} onChange={patch} />}
        {step.id === 'setup' && (
          <SetupScheduleStep
            values={values}
            errors={fields}
            onChange={patch}
            surfaceTypesCatalog={surfaceTypesCatalog}
            onSurfaceCatalogRefresh={loadSurfaceTypesCatalog}
          />
        )}
        {step.id === 'ageGroups' && (
          <AgeGroupSelectStep
            values={values}
            errors={fields}
            onChange={patch}
            ageGroupsCatalog={ageGroupsCatalog}
            onCatalogRefresh={loadAgeGroupsCatalog}
          />
        )}
        {step.id === 'ageGroupDetails' && (
          <AgeGroupDetailsStep
            values={values}
            errors={ageGroupFieldErrors}
            onChange={patch}
            ageGroupsCatalog={ageGroupsCatalog}
          />
        )}
        {step.id === 'extras' && <ExtrasStep values={values} errors={fields} onChange={patch} />}
        {step.id === 'review' && (
          <>
            {submitBanner && (
              <div className={`${styles.banner ?? ''} ${styles.bannerError ?? ''}`} role="alert">
                {submitBanner}
              </div>
            )}
            <ReviewStep
              values={values}
              ageGroupsCatalog={ageGroupsCatalog}
              surfaceTypesCatalog={surfaceTypesCatalog}
              onJump={setCurrentIndex}
            />
          </>
        )}

        <div className={wizardStyles.footerNav}>
          <button
            type="button"
            className={styles.submit}
            style={currentIndex === 0 ? { visibility: 'hidden' } : undefined}
            onClick={back}
          >
            Back
          </button>
          <div className={wizardStyles.footerNavRight}>
            {!isLastStep && (
              <button type="button" className={styles.submit} onClick={next}>
                Next
              </button>
            )}
            {isLastStep && mode === 'edit' && (
              <button
                type="button"
                className={styles.submit}
                disabled={!!submitting}
                onClick={() => void submit(false)}
              >
                {submitting ? 'Saving…' : 'Save changes'}
              </button>
            )}
            {isLastStep && mode === 'create' && (
              <>
                <button
                  type="button"
                  className={styles.submitSecondary}
                  disabled={!!submitting}
                  onClick={() => void submit(false)}
                >
                  {submitting === 'draft' ? 'Saving…' : 'Save as Draft'}
                </button>
                <button
                  type="button"
                  className={styles.submit}
                  disabled={!!submitting}
                  onClick={() => setConfirmPublish(true)}
                >
                  {submitting === 'publish' ? 'Publishing…' : 'Publish'}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmPublish}
        title="Publish this tournament?"
        message="It becomes publicly visible right away, and there's no way to revert it to a draft or edit it further once published."
        confirmLabel="Publish"
        onConfirm={() => {
          setConfirmPublish(false);
          void submit(true);
        }}
        onCancel={() => setConfirmPublish(false)}
      />
    </div>
  );
}

export function DashboardOrganizerTournamentsNewPage() {
  return <TournamentWizard mode="create" />;
}
