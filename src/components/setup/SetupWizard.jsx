import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getStoredAcademySettings, saveSettingsToLocal } from '../../lib/academySettings';
import { getStoredLicense } from '../../lib/licenseService';
import { extractStandardAndSection } from '../../lib/classHierarchyHelper';
import { currentAcademicYear } from '../../lib/dateUtils';
import { codeFromName, parseClassLines } from '../../lib/classSetup';

const DONE_KEY = 'sms_setup_done';
const STEPS = ['Welcome', 'Your school', 'Classes', 'Students', 'Finish'];

/**
 * One-time welcome wizard for a brand-new school (empty database): school details + logo, the classes, then where to
 * add students. Skipped for any school that already has students or batches. Everything can be changed later.
 */
export default function SetupWizard({ onNavigate }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState([]);
  const [wantImport, setWantImport] = useState(false);

  const saved = useMemo(() => getStoredAcademySettings(), []);
  const [form, setForm] = useState(() => ({
    academy_name: getStoredLicense()?.schoolName || (saved.academy_name !== 'SMS — Student Management System' ? saved.academy_name : ''),
    branch_name: saved.branch_name || '',
    address: saved.address || '',
    phone: saved.phone || '',
    email: saved.email || '',
    academic_year: saved.academic_year && /\d{4}/.test(saved.academic_year) ? saved.academic_year : currentAcademicYear(),
    logo_url: saved.logo_url || '',
  }));
  const [classText, setClassText] = useState('');

  // Show only for a school with no data that has not finished/skipped the wizard.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (localStorage.getItem(DONE_KEY)) return;
        const [{ data: st }, { data: ba }] = await Promise.all([supabase.from('students').select('id'), supabase.from('batches').select('id')]);
        if (!alive) return;
        if ((st || []).length > 0 || (ba || []).length > 0) localStorage.setItem(DONE_KEY, 'existing');
        else setVisible(true);
      } catch {
        // can't tell: do not interrupt
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!visible) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const classes = parseClassLines(classText);

  const close = (to) => {
    try { localStorage.setItem(DONE_KEY, new Date().toISOString()); } catch {}
    setVisible(false);
    if (to && onNavigate) onNavigate(to);
  };

  const onLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Logo image should be under 2 MB.'); return; }
    const r = new FileReader();
    r.onload = (ev) => setForm((f) => ({ ...f, logo_url: ev.target.result }));
    r.readAsDataURL(file);
  };

  const saveSchool = () => {
    if (!form.academy_name.trim()) { setError('Please enter your school / institute name.'); return false; }
    saveSettingsToLocal({ ...getStoredAcademySettings(), ...form, academy_name: form.academy_name.trim() });
    setError('');
    return true;
  };

  const createClasses = async () => {
    setBusy(true);
    setError('');
    try {
      const { data: existingCourses } = await supabase.from('courses').select('id, name');
      const { data: existingBatches } = await supabase.from('batches').select('id, name, code');
      const takenCodes = new Set((existingBatches || []).map((b) => String(b.code || '').toUpperCase()));
      const makes = [];
      for (const line of classes) {
        if ((existingBatches || []).some((b) => String(b.name).toLowerCase() === line.toLowerCase())) continue;
        const { standard } = extractStandardAndSection({ name: line, code: '' });
        let course = (existingCourses || []).find((c) => String(c.name).trim().toLowerCase() === standard.toLowerCase());
        const code = codeFromName(line, takenCodes);
        takenCodes.add(code);
        if (!course) {
          const { data, error: ce } = await supabase.from('courses').insert([{ name: standard, code: codeFromName(standard), level: standard, is_active: true }]).select().single();
          if (ce) throw ce;
          course = data;
          existingCourses.push(course);
        }
        const { error: be } = await supabase.from('batches').insert([{
          name: line, code, course_id: course.id, academic_year: form.academic_year, shift: 'Morning', max_capacity: 60, is_active: true,
        }]);
        if (be) throw be;
        makes.push(line);
      }
      setCreated(makes);
      window.dispatchEvent(new CustomEvent('sms-db-mutation', { detail: { tableName: 'batches', count: makes.length } }));
      return true;
    } catch (err) {
      setError('Could not create the classes: ' + (err.message || err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    if (step === 1 && !saveSchool()) return;
    if (step === 2 && classes.length > 0 && !(await createClasses())) return;
    setStep((s) => s + 1);
  };

  const card = { width: 'min(560px, 94vw)', maxHeight: 'calc(92vh / var(--ui-zoom, 1))', overflowY: 'auto', background: '#fff', borderRadius: '14px', boxShadow: '0 25px 60px rgba(0,0,0,0.45)' };
  const label = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' };
  const field = { width: '100%', padding: '9px 11px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(7,14,25,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      <div style={card} role="dialog" aria-label="Set up your school">
        <div style={{ padding: '18px 22px', background: '#0a1424', borderRadius: '14px 14px 0 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo.svg" alt="" style={{ width: '38px', height: '38px', borderRadius: '9px' }} />
          <div style={{ color: '#fff' }}>
            <div style={{ fontWeight: 800, fontSize: '16px' }}>Set up your school</div>
            <div style={{ fontSize: '12px', color: '#c5a880' }}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</div>
          </div>
        </div>
        <div style={{ height: '4px', background: '#e2e8f0' }}><div style={{ height: '4px', width: `${((step + 1) / STEPS.length) * 100}%`, background: '#c5a880', transition: 'width .25s' }} /></div>

        <div style={{ padding: '20px 22px' }}>
          {step === 0 && (
            <div style={{ fontSize: '14px', color: '#334155', lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}><strong>Welcome!</strong> This takes about 2 minutes. You will add your school's name and logo, create your classes, and then add students.</p>
              <ul style={{ paddingLeft: '18px', margin: '8px 0' }}>
                <li>Your name and logo appear on receipts, report cards and reports.</li>
                <li>Everything can be changed later in Settings.</li>
                <li>Your data stays on this computer and is backed up automatically every day.</li>
              </ul>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div><label style={label}>School / Institute name *</label><input style={field} value={form.academy_name} onChange={set('academy_name')} placeholder="e.g. Shree Saraswati Vidya Mandir" autoFocus /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={label}>Branch / Campus</label><input style={field} value={form.branch_name} onChange={set('branch_name')} placeholder="Main Campus" /></div>
                <div><label style={label}>Academic year</label><input style={field} value={form.academic_year} onChange={set('academic_year')} placeholder="2026-27" /></div>
              </div>
              <div><label style={label}>Address</label><input style={field} value={form.address} onChange={set('address')} placeholder="Street, city" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={label}>Phone</label><input style={field} value={form.phone} onChange={set('phone')} placeholder="+91 …" /></div>
                <div><label style={label}>Email</label><input style={field} value={form.email} onChange={set('email')} placeholder="office@school.in" /></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {form.logo_url ? <img src={form.logo_url} alt="School logo" style={{ height: '48px', maxWidth: '110px', objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px' }} /> : <div style={{ width: '48px', height: '48px', borderRadius: '8px', border: '1px dashed #94a3b8' }} />}
                <label style={{ ...label, margin: 0, cursor: 'pointer', color: '#0a1424', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px' }}>
                  {form.logo_url ? 'Change logo' : 'Upload school logo (optional)'}
                  <input type="file" accept="image/*" onChange={onLogo} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <label style={label}>Your classes / batches — one per line</label>
              <textarea
                style={{ ...field, minHeight: '150px', fontFamily: 'inherit' }}
                value={classText}
                onChange={(e) => setClassText(e.target.value)}
                placeholder={'Class 8 A\nClass 8 B\n11th Commerce\n12th Science A'}
              />
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                {classes.length ? `${classes.length} class${classes.length > 1 ? 'es' : ''} will be created: ${classes.slice(0, 6).join(', ')}${classes.length > 6 ? '…' : ''}` : 'You can skip this and add classes later from the Batches page.'}
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ fontSize: '14px', color: '#334155', lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}><strong>How will you add your students?</strong></p>
              {[
                [true, 'Import from an Excel file', 'Fastest for many students. A ready-made template is on the Import page.'],
                [false, 'Add them one by one later', 'Use the Students page whenever you are ready.'],
              ].map(([val, title, desc]) => (
                <label key={title} style={{ display: 'flex', gap: '10px', padding: '10px 12px', border: `2px solid ${wantImport === val ? '#c5a880' : '#e2e8f0'}`, borderRadius: '10px', marginBottom: '8px', cursor: 'pointer' }}>
                  <input type="radio" checked={wantImport === val} onChange={() => setWantImport(val)} />
                  <span><strong>{title}</strong><br /><span style={{ fontSize: '12.5px', color: '#64748b' }}>{desc}</span></span>
                </label>
              ))}
            </div>
          )}

          {step === 4 && (
            <div style={{ fontSize: '14px', color: '#334155', lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}><strong>You're ready.</strong></p>
              <ul style={{ paddingLeft: '18px', margin: '8px 0' }}>
                <li>School details saved{form.logo_url ? ' with your logo' : ''}.</li>
                <li>{created.length ? `${created.length} class${created.length > 1 ? 'es' : ''} created.` : 'No classes created yet — add them on the Batches page.'}</li>
                <li>Teacher phones: install the app, then open <strong>Attendance → Teacher App Connect</strong> and scan the code.</li>
                <li>Parent messages: connect your Telegram bot in <strong>Settings</strong>.</li>
              </ul>
            </div>
          )}

          {error && <div style={{ marginTop: '12px', color: '#b91c1c', fontSize: '13px', fontWeight: 600 }}>{error}</div>}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" onClick={() => close()} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '13px' }}>Skip for now</button>
          <div style={{ display: 'flex', gap: '8px' }}>
            {step > 0 && step < 4 && <button type="button" onClick={() => setStep(step - 1)} disabled={busy} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Back</button>}
            {step < 4 && <button type="button" onClick={next} disabled={busy} style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#0a1424', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Please wait…' : step === 0 ? 'Get started' : 'Next'}</button>}
            {step === 4 && <button type="button" onClick={() => close(wantImport ? 'import' : 'dashboard')} style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#0a1424', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{wantImport ? 'Go to Import' : 'Open the app'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
