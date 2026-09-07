import { createGroundSchema } from '@nforce/shared';
import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { DateField } from '../../DateField';
import { TimeField } from '../../TimeField';
import { api } from '../../../lib/apiClient';
import { todayISODate } from '../../../lib/calendar';
import { errorsFrom, validateForm, type FieldErrors } from '../../../lib/forms';
import { Icon } from '../ui/Icon';
import type { GroundsOutletContext } from './GroundsLayout';
import styles from './GroundsPage.module.css';

export function DashboardGroundsAddPage() {
  const { reloadGrounds } = useOutletContext<GroundsOutletContext>();
  const navigate = useNavigate();

  const [banner, setBanner] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [form, setForm] = useState({
    name: '',
    location: '',
    capacity: '',
    facilities: '',
    from: '06:00',
    to: '22:00',
    startDate: '',
    endDate: '',
  });
  const [creating, setCreating] = useState(false);

  async function create() {
    setBanner(null);
    const parsed = validateForm(createGroundSchema, {
      name: form.name,
      location: form.location,
      capacity: form.capacity === '' ? null : Number(form.capacity),
      facilities: form.facilities
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean),
      availabilityRules: [
        {
          days: 'all',
          from: form.from,
          to: form.to,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
        },
      ],
    });
    if (!parsed.ok) {
      setFields(parsed.fields);
      return;
    }
    setFields({});
    setCreating(true);
    try {
      await api('/api/grounds', { body: parsed.data });
      await reloadGrounds();
      navigate('/grounds');
    } catch (err) {
      const e = errorsFrom(err);
      setFields(e.fields);
      setBanner(e.banner);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className={styles.panel} aria-label="Add a ground">
      <header className={styles.header}>
        <div className={styles.headText}>
          <h2 className={styles.h2}>Add a ground</h2>
          <p className={styles.deck}>List a ground and manage incoming booking requests.</p>
        </div>
      </header>

      {banner && <p className={styles.actionError}>{banner}</p>}

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Name</span>
          <input
            className={styles.input}
            placeholder="Name"
            maxLength={80}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Location</span>
          <input
            className={styles.input}
            placeholder="Location"
            maxLength={100}
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Capacity</span>
          <input
            className={styles.input}
            type="number"
            min={0}
            placeholder="Capacity"
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Facilities</span>
          <input
            className={styles.input}
            placeholder="Comma separated"
            value={form.facilities}
            onChange={(e) => setForm((f) => ({ ...f, facilities: e.target.value }))}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Open time</span>
          <TimeField
            ariaLabel="Open time"
            value={form.from}
            onChange={(v) => setForm((f) => ({ ...f, from: v }))}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Close time</span>
          <TimeField
            ariaLabel="Close time"
            value={form.to}
            onChange={(v) => setForm((f) => ({ ...f, to: v }))}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Available from (optional)</span>
          <DateField
            ariaLabel="Available from date"
            placeholder="Available from (optional)"
            value={form.startDate}
            onChange={(v) => setForm((f) => ({ ...f, startDate: v }))}
            min={todayISODate()}
            clearable
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Available until (optional)</span>
          <DateField
            ariaLabel="Available until date"
            placeholder="Available until (optional)"
            value={form.endDate}
            onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
            min={form.startDate || todayISODate()}
            clearable
          />
        </label>
      </div>

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={creating}
          onClick={() => void create()}
        >
          <Icon name="plus" size={15} />
          <span>{creating ? 'Adding…' : 'Add ground'}</span>
        </button>
      </div>

      <p className={styles.hint}>
        Availability applies to all days between the two times. The two dates set an optional window
        when the ground can be booked. Leave them blank for no date limit.
      </p>

      {Object.values(fields).length > 0 && (
        <div className={styles.fieldErrors}>
          {Object.values(fields).map((msg, i) => (
            <p className={styles.fieldError} key={i}>
              {msg}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
