import { useState } from 'react';
import { Modal, Field, useToast } from './ui.jsx';
import { PLANS } from './format.js';
import { createSchool, updateSchool } from './api.js';

const VALIDITY = [
  { value: '7', label: '7 days' },
  { value: '15', label: '15 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: '9999', label: 'Lifetime' },
  { value: 'custom', label: 'Custom…' },
];

/** Create a school (no `school` prop) or edit one's details (pass `school`). */
export default function SchoolForm({ school, onSaved, onClose }) {
  const editing = Boolean(school);
  const toast = useToast();
  const [f, setF] = useState({
    schoolName: school?.schoolName || '',
    contactPerson: school?.contactPerson || '',
    email: school?.email || '',
    phone: school?.phone || '',
    notes: school?.notes || '',
    type: school?.type || 'trial',
    validity: '30',
    customDays: '45',
    maxStudents: String(school?.maxStudents || 200),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!f.schoolName.trim()) return setError('School name is required.');
    const payload = {
      schoolName: f.schoolName,
      contactPerson: f.contactPerson,
      email: f.email,
      phone: f.phone,
      notes: f.notes,
      type: f.type,
      maxStudents: Number(f.maxStudents),
    };
    if (!editing) payload.days = f.validity === 'custom' ? Number(f.customDays) : Number(f.validity);
    setSaving(true);
    const res = editing ? await updateSchool(school.licenseKey, payload) : await createSchool(payload);
    setSaving(false);
    if (!res.ok) return setError(res.error || 'Could not save.');
    toast(editing ? 'Details saved' : `School created`);
    onSaved(res.license, !editing);
  };

  return (
    <Modal
      title={editing ? `Edit ${school.schoolName}` : 'Add a school'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button form="school-form" type="submit" className="adm-btn adm-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create school & key'}
          </button>
        </>
      }
    >
      <form id="school-form" onSubmit={submit} className="adm-form">
        {error && <div className="adm-alert adm-alert-red">{error}</div>}
        <Field label="School name *">
          <input className="adm-input" value={f.schoolName} onChange={set('schoolName')} maxLength={120} autoFocus />
        </Field>
        <div className="adm-grid-2">
          <Field label="Contact person">
            <input className="adm-input" value={f.contactPerson} onChange={set('contactPerson')} maxLength={120} placeholder="Principal / administrator" />
          </Field>
          <Field label="Phone / WhatsApp">
            <input className="adm-input" value={f.phone} onChange={set('phone')} maxLength={40} inputMode="tel" />
          </Field>
        </div>
        <Field label="Email">
          <input className="adm-input" type="email" value={f.email} onChange={set('email')} maxLength={160} />
        </Field>
        <div className="adm-grid-2">
          <Field label="Licence type">
            <select className="adm-input" value={f.type} onChange={set('type')}>
              <option value="trial">Free trial</option>
              <option value="paid">Paid</option>
            </select>
          </Field>
          {!editing && (
            <Field label="Valid for">
              <select className="adm-input" value={f.validity} onChange={set('validity')}>
                {VALIDITY.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </Field>
          )}
        </div>
        {!editing && f.validity === 'custom' && (
          <Field label="Number of days">
            <input className="adm-input" type="number" min="1" max="3650" value={f.customDays} onChange={set('customDays')} />
          </Field>
        )}
        <Field label="Student limit" hint="The app stops adding students at this number.">
          <div className="adm-chips">
            {PLANS.map((p) => (
              <button
                type="button"
                key={p.limit}
                className={`adm-chip ${Number(f.maxStudents) === p.limit ? 'is-on' : ''}`}
                onClick={() => setF((x) => ({ ...x, maxStudents: String(p.limit) }))}
              >
                {p.label}
              </button>
            ))}
            <input className="adm-input adm-input-num" type="number" min="1" max="100000" value={f.maxStudents} onChange={set('maxStudents')} aria-label="Custom student limit" />
          </div>
        </Field>
        <Field label="Notes (only you see this)">
          <textarea className="adm-input" rows={3} value={f.notes} onChange={set('notes')} maxLength={1000} />
        </Field>
      </form>
    </Modal>
  );
}
