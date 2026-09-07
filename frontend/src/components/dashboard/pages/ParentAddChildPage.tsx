import { addChildSchema } from '@nforce/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../../lib/apiClient';
import { dobMonthBounds, monthValueToISODate } from '../../../lib/calendar';
import { errorsFrom, validateForm, type FieldErrors } from '../../../lib/forms';
import { MonthYearField } from '../../MonthYearField';
import { Icon } from '../ui/Icon';
import styles from './ParentPage.module.css';

export function DashboardParentAddChildPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dobBounds = dobMonthBounds();

  async function addChild() {
    setBanner(null);
    const parsed = validateForm(addChildSchema, {
      name,
      dateOfBirth: dob ? monthValueToISODate(dob) : '',
    });
    if (!parsed.ok) {
      setFields(parsed.fields);
      return;
    }
    setFields({});
    setSaving(true);
    try {
      await api('/api/parent/children', { body: parsed.data });
      navigate('/parent');
    } catch (err) {
      const e = errorsFrom(err);
      setFields(e.fields);
      setBanner(e.banner);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="Add a child">
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>Add a child</h2>
            <p className={styles.deck}>
              Add their name and date of birth. You can register them for tournaments and manage
              their squad invites right after.
            </p>
          </div>
          <Link to="/parent" className={styles.editToggle}>
            <Icon name="arrow-right" size={13} />
            <span>Back to My Children</span>
          </Link>
        </header>

        {banner && (
          <p className={styles.bannerError} role="alert">
            {banner}
          </p>
        )}

        <div className={styles.createBlock}>
          <div className={styles.createRow}>
            <input
              className={styles.createInput}
              placeholder="Child's full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
            />
            <MonthYearField
              value={dob}
              onChange={setDob}
              placeholder="Date of birth (month, year)"
              min={dobBounds.min}
              max={dobBounds.max}
              ariaLabel="Child's date of birth"
            />
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => void addChild()}
              disabled={saving}
            >
              <Icon name="plus" size={15} />
              <span>{saving ? 'Adding…' : 'Add child'}</span>
            </button>
          </div>
          {(fields.name || fields.dateOfBirth) && (
            <p className={styles.fieldError}>{fields.name ?? fields.dateOfBirth}</p>
          )}
        </div>
      </section>
    </div>
  );
}
