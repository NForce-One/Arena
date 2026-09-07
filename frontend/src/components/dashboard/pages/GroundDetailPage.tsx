import type { AvailabilityRuleDto, GroundDto } from '@nforce/shared';
import { updateGroundSchema } from '@nforce/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DateField } from '../../DateField';
import { DaysField } from '../../DaysField';
import { TimeField } from '../../TimeField';
import { api } from '../../../lib/apiClient';
import { todayISODate } from '../../../lib/calendar';
import { errorsFrom, validateForm } from '../../../lib/forms';
import { describeRule, describeRuleDates, describeRuleDays } from '../../../lib/grounds';
import { CricketLoader } from '../../CricketLoader';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import styles from './GroundsPage.module.css';

interface RuleFormState {
  days: string;
  from: string;
  to: string;
  startDate: string;
  endDate: string;
}

const emptyRuleForm: RuleFormState = {
  days: 'all',
  from: '06:00',
  to: '22:00',
  startDate: '',
  endDate: '',
};

function ruleFormFrom(r: AvailabilityRuleDto): RuleFormState {
  return {
    days: r.days,
    from: r.from,
    to: r.to,
    startDate: r.startDate ?? '',
    endDate: r.endDate ?? '',
  };
}

interface EditingSession {
  index: number | null;
}

function RuleEditor({
  ruleForm,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  ruleForm: RuleFormState;
  onChange: (next: RuleFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className={styles.ruleEditor}>
      <label className={styles.ruleField}>
        <span className={styles.fieldLabel}>Days</span>
        <DaysField
          ariaLabel="Days"
          value={ruleForm.days}
          onChange={(v) => onChange({ ...ruleForm, days: v })}
        />
      </label>
      <label className={styles.ruleField}>
        <span className={styles.fieldLabel}>Open time</span>
        <TimeField
          ariaLabel="Open time"
          value={ruleForm.from}
          onChange={(v) => onChange({ ...ruleForm, from: v })}
        />
      </label>
      <label className={styles.ruleField}>
        <span className={styles.fieldLabel}>Close time</span>
        <TimeField
          ariaLabel="Close time"
          value={ruleForm.to}
          onChange={(v) => onChange({ ...ruleForm, to: v })}
        />
      </label>
      <label className={styles.ruleField}>
        <span className={styles.fieldLabel}>From (optional)</span>
        <DateField
          ariaLabel="Available from date"
          placeholder="From (optional)"
          value={ruleForm.startDate}
          onChange={(v) => onChange({ ...ruleForm, startDate: v })}
          min={todayISODate()}
          clearable
        />
      </label>
      <label className={styles.ruleField}>
        <span className={styles.fieldLabel}>Until (optional)</span>
        <DateField
          ariaLabel="Available until date"
          placeholder="Until (optional)"
          value={ruleForm.endDate}
          onChange={(v) => onChange({ ...ruleForm, endDate: v })}
          min={ruleForm.startDate || todayISODate()}
          clearable
        />
      </label>
      <div className={styles.ruleEditorActions}>
        <button type="button" className={styles.btnPrimarySmall} disabled={saving} onClick={onSave}>
          <Icon name="shield-check" size={13} />
          <span>{saving ? 'Saving…' : 'Save'}</span>
        </button>
        <button type="button" className={styles.btnGhostSmall} disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function DashboardGroundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ground, setGround] = useState<GroundDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api<{ grounds: GroundDto[] }>('/api/grounds/mine');
      const found = data.grounds.find((g) => g.id === id) ?? null;
      setGround(found);
      if (!found) setLoadError('Ground not found.');
    } catch (err) {
      setLoadError(errorsFrom(err).banner ?? 'Could not load this ground.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const [editing, setEditing] = useState<EditingSession | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(emptyRuleForm);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [ruleDeleteIndex, setRuleDeleteIndex] = useState<number | null>(null);

  function startAddRule() {
    setEditing({ index: null });
    setRuleForm(emptyRuleForm);
    setRuleError(null);
  }

  function startEditRule(index: number) {
    if (!ground) return;
    setEditing({ index });
    setRuleForm(ruleFormFrom(ground.availabilityRules[index]!));
    setRuleError(null);
  }

  function cancelRuleEdit() {
    setEditing(null);
    setRuleError(null);
  }

  async function saveRule() {
    if (!ground || !editing) return;
    setRuleError(null);
    const draftRule = {
      days: ruleForm.days,
      from: ruleForm.from,
      to: ruleForm.to,
      startDate: ruleForm.startDate || null,
      endDate: ruleForm.endDate || null,
    };
    const nextRules = [...ground.availabilityRules];
    if (editing.index === null) nextRules.push(draftRule);
    else nextRules[editing.index] = draftRule;

    const parsed = validateForm(updateGroundSchema, { availabilityRules: nextRules });
    if (!parsed.ok) {
      setRuleError(Object.values(parsed.fields)[0] ?? 'Please check the availability window.');
      return;
    }
    setRuleSaving(true);
    try {
      await api(`/api/grounds/${ground.id}`, { method: 'PATCH', body: parsed.data });
      setEditing(null);
      await load();
    } catch (err) {
      const e = errorsFrom(err);
      setRuleError(e.banner ?? Object.values(e.fields)[0] ?? 'Could not save.');
    } finally {
      setRuleSaving(false);
    }
  }

  function deleteRule(index: number) {
    if (!ground) return;
    setRuleError(null);
    if (ground.availabilityRules.length <= 1) {
      setRuleError(
        'At least one availability window is required. Add another before deleting this one.',
      );
      return;
    }
    setRuleDeleteIndex(index);
  }

  async function doDeleteRule() {
    if (!ground || ruleDeleteIndex === null) return;
    const index = ruleDeleteIndex;
    setRuleDeleteIndex(null);
    const nextRules = ground.availabilityRules.filter((_, i) => i !== index);
    try {
      await api(`/api/grounds/${ground.id}`, {
        method: 'PATCH',
        body: { availabilityRules: nextRules },
      });
      await load();
    } catch (err) {
      setRuleError(errorsFrom(err).banner ?? 'Could not delete.');
    }
  }

  async function deleteGround() {
    if (!ground) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await api(`/api/grounds/${ground.id}`, { method: 'DELETE' });
      navigate('/grounds');
    } catch (err) {
      setDeleteError(errorsFrom(err).banner ?? 'Could not delete this ground.');
      setDeleting(false);
    }
  }

  if (loadError) {
    return (
      <div className={styles.page}>
        <section className={styles.panel} aria-label="Ground">
          <p className={styles.actionError}>{loadError}</p>
          <Link to="/grounds" className={styles.deleteGroundBtn}>
            <Icon name="arrow-right" size={13} />
            <span>Back to My Grounds</span>
          </Link>
        </section>
      </div>
    );
  }

  if (!ground) {
    return (
      <div className={styles.page}>
        <CricketLoader label="Loading ground…" />
      </div>
    );
  }

  const anyEditing = editing !== null;

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label={ground.name}>
        <header className={styles.header}>
          <div className={styles.headText}>
            <h2 className={styles.h2}>{ground.name}</h2>
            <p className={styles.deck}>Manage facilities and availability windows.</p>
          </div>
          <Link to="/grounds" className={styles.deleteGroundBtn}>
            <Icon name="arrow-right" size={13} />
            <span>Back to My Grounds</span>
          </Link>
        </header>

        {deleteError && <p className={styles.actionError}>{deleteError}</p>}

        <article className={styles.groundCard}>
          <header className={styles.groundHead}>
            <div className={styles.groundHeadText}>
              <h3 className={styles.groundName}>{ground.name}</h3>
              <div className={styles.groundMeta}>
                <span className={styles.metaItem}>
                  <Icon name="map-pin" size={14} />
                  {ground.location}
                </span>
                {ground.capacity != null && (
                  <span className={styles.metaItem}>
                    <Icon name="users" size={14} />
                    {ground.capacity}
                  </span>
                )}
              </div>
              {ground.facilities.length > 0 && (
                <div className={styles.facilities}>
                  {ground.facilities.map((f) => (
                    <span className={styles.facilityChip} key={f}>
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className={styles.deleteGroundBtn}
              onClick={() => setDeleteConfirmOpen(true)}
              aria-label={`Delete ${ground.name}`}
            >
              <Icon name="x" size={13} />
              <span>Delete ground</span>
            </button>
          </header>

          <div className={styles.rulesBlock}>
            <span className={styles.fieldLabel}>Availability</span>
            <div className={styles.ruleList}>
              {ground.availabilityRules.map((r, i) =>
                editing?.index === i ? (
                  <RuleEditor
                    key={i}
                    ruleForm={ruleForm}
                    onChange={setRuleForm}
                    onSave={() => void saveRule()}
                    onCancel={cancelRuleEdit}
                    saving={ruleSaving}
                  />
                ) : (
                  <div className={styles.ruleRow} key={i}>
                    <div className={styles.ruleInfo}>
                      <span className={styles.ruleDays}>{describeRuleDays(r)}</span>
                      <span className={styles.ruleTime}>
                        {r.from}–{r.to}
                      </span>
                      {(r.startDate || r.endDate) && (
                        <span className={styles.ruleDateRange}>
                          {describeRuleDates(r)
                            .trim()
                            .replace(/^\(|\)$/g, '')}
                        </span>
                      )}
                    </div>
                    {!anyEditing && (
                      <div className={styles.ruleActions}>
                        <button
                          type="button"
                          className={styles.btnGhostSmall}
                          onClick={() => startEditRule(i)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.btnGhostSmall}
                          onClick={() => deleteRule(i)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ),
              )}
              {editing?.index === null && (
                <RuleEditor
                  ruleForm={ruleForm}
                  onChange={setRuleForm}
                  onSave={() => void saveRule()}
                  onCancel={cancelRuleEdit}
                  saving={ruleSaving}
                />
              )}
            </div>

            {ruleError && <p className={styles.fieldError}>{ruleError}</p>}

            {!anyEditing && (
              <button type="button" className={styles.addRule} onClick={startAddRule}>
                <Icon name="plus" size={13} />
                <span>Add availability window</span>
              </button>
            )}
          </div>
        </article>
      </section>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete ground?"
        message={`Delete "${ground.name}"? This can't be undone. Grounds with any bookings or scheduled fixtures can't be deleted. Cancel or reassign those first.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        onConfirm={() => void deleteGround()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <ConfirmDialog
        open={ruleDeleteIndex !== null}
        title="Delete this availability window?"
        message={
          ruleDeleteIndex !== null
            ? `Delete "${describeRule(ground.availabilityRules[ruleDeleteIndex]!)}" from ${ground.name}? There's no undo. You'd have to re-enter the days/times to bring it back.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => void doDeleteRule()}
        onCancel={() => setRuleDeleteIndex(null)}
      />
    </div>
  );
}
