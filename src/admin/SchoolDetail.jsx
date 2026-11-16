import { useEffect, useState } from 'react';
import { Badge, ConfirmDialog, CopyButton, Field, Modal, useToast } from './ui.jsx';
import {
  AUDIT_LABELS, PLANS, activationMessage, auditSummary, expiryText, fmtDate, fmtDateTime, schoolState, timeAgo,
} from './format.js';
import { deleteSchool, listAudit, resetDevice, setDays, setLock, setTier, setTimer } from './api.js';

/** Side panel with everything you can do to one school. */
export default function SchoolDetail({ school, onChanged, onDeleted, onEdit, onClose }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [customDays, setCustomDays] = useState('30');
  const [history, setHistory] = useState({ loading: true, rows: [] });
  const state = schoolState(school);
  const isShared = school.kind !== 'school';

  useEffect(() => {
    let alive = true;
    listAudit(school.licenseKey, 15).then((r) => alive && setHistory({ loading: false, rows: r.ok ? r.audit : [] }));
    return () => { alive = false; };
  }, [school.licenseKey, school.daysRemaining, school.status, school.maxStudents, school.boundDeviceId, school.isLocked]);

  /** Runs one API call, updates the list from the server's answer, and reports the result. */
  const act = async (call, okMessage) => {
    setBusy(true);
    const res = await call();
    setBusy(false);
    if (!res.ok) { toast(res.error || 'That did not work.', 'err'); return false; }
    if (res.license) onChanged(res.license);
    toast(okMessage);
    return true;
  };

  const extend = (days) => act(() => setDays(school.licenseKey, days, false), `Added ${days} days`);
  const lifetime = () => act(() => setDays(school.licenseKey, 9999, true), 'Now a lifetime licence');
  const setExact = () => {
    const n = Number(customDays);
    if (!Number.isInteger(n) || n < 0 || n > 3650) return toast('Enter days from 0 to 3650.', 'err');
    return act(() => setDays(school.licenseKey, n, true), `Set to ${n} days from today`);
  };

  return (
    <aside className="adm-panel" aria-label={`${school.schoolName} details`}>
      <header className="adm-panel-head">
        <div>
          <h2>{school.schoolName}</h2>
          <div className="adm-row">
            <Badge tone={state.tone}>{state.label}</Badge>
            <span className="adm-muted">{school.type === 'paid' ? 'Paid' : 'Trial'} · {school.maxStudents.toLocaleString()} students</span>
          </div>
        </div>
        <button className="adm-icon-btn" onClick={onClose} aria-label="Close panel">✕</button>
      </header>

      <div className="adm-panel-body">
        <section className="adm-card-flat">
          <div className="adm-kv"><span>Licence key</span><code>{school.licenseKey}</code></div>
          <div className="adm-row adm-gap">
            <CopyButton text={school.licenseKey} label="Copy key" />
            {!isShared && <CopyButton text={activationMessage(school)} label="Copy message for school" />}
          </div>
          <div className="adm-kv"><span>Valid until</span><b>{expiryText(school)}</b></div>
          <div className="adm-kv"><span>Computer</span><b>{school.boundDeviceId ? 'Activated on 1 computer' : isShared ? `${school.deviceGrantCount} computers used it` : 'Not activated yet'}</b></div>
          <div className="adm-kv"><span>Last check-in</span><b>{timeAgo(school.lastSeenAt)}</b></div>
          <div className="adm-kv"><span>Created</span><b>{fmtDate(school.createdAt)}</b></div>
          {!isShared && (
            <>
              <div className="adm-kv"><span>Contact</span><b>{school.contactPerson || '—'}</b></div>
              <div className="adm-kv"><span>Phone</span><b>{school.phone || '—'}</b></div>
              <div className="adm-kv"><span>Email</span><b>{school.email || '—'}</b></div>
              {school.notes && <div className="adm-kv"><span>Notes</span><b>{school.notes}</b></div>}
            </>
          )}
        </section>

        {!isShared && (
          <section>
            <h3>Validity</h3>
            <div className="adm-chips">
              {[7, 30, 90, 365].map((d) => (
                <button key={d} className="adm-btn adm-btn-sm" disabled={busy || school.isLifetime} onClick={() => extend(d)}>+{d} days</button>
              ))}
              <button className="adm-btn adm-btn-sm" disabled={busy || school.isLifetime} onClick={lifetime}>Make lifetime</button>
            </div>
            <div className="adm-row adm-gap" style={{ marginTop: 8 }}>
              <input className="adm-input adm-input-num" type="number" min="0" max="3650" value={customDays} onChange={(e) => setCustomDays(e.target.value)} aria-label="Exact days from today" />
              <button className="adm-btn adm-btn-sm" disabled={busy} onClick={setExact}>Set to this many days from today</button>
            </div>
            {school.isLifetime && <p className="adm-muted adm-small">Lifetime licence. Use "Set to…" to turn it into a timed licence.</p>}
          </section>
        )}

        {!isShared && (
          <section>
            <h3>Student limit</h3>
            <div className="adm-chips">
              {PLANS.map((p) => (
                <button
                  key={p.limit}
                  className={`adm-chip ${school.maxStudents === p.limit ? 'is-on' : ''}`}
                  disabled={busy}
                  onClick={() => school.maxStudents !== p.limit && act(() => setTier(school.licenseKey, p.limit), `Limit set to ${p.limit}`)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3>Controls</h3>
          <div className="adm-stack">
            <button
              className={`adm-btn ${school.isLocked ? 'adm-btn-primary' : 'adm-btn-warn'}`}
              disabled={busy}
              onClick={() => school.isLocked
                ? act(() => setLock(school.licenseKey, false), 'Unlocked')
                : setConfirm({ kind: 'lock' })}
            >
              {school.isLocked ? 'Unlock this school' : 'Lock this school now'}
            </button>
            <button className="adm-btn" disabled={busy || !school.boundDeviceId} onClick={() => setConfirm({ kind: 'reset' })}>
              Free the key for a new computer
            </button>
            {!isShared && (
              <button className="adm-btn" disabled={busy} onClick={() => act(() => setTimer(school.licenseKey, !school.isTimerVisible), school.isTimerVisible ? 'Countdown hidden' : 'Countdown shown')}>
                {school.isTimerVisible ? 'Hide' : 'Show'} trial countdown in their app
              </button>
            )}
            {!isShared && <button className="adm-btn" disabled={busy} onClick={() => onEdit(school)}>Edit details</button>}
            {!isShared && <button className="adm-btn adm-btn-danger-outline" disabled={busy} onClick={() => setConfirm({ kind: 'delete' })}>Delete school…</button>}
          </div>
        </section>

        <section>
          <h3>History</h3>
          {history.loading ? <p className="adm-muted adm-small">Loading…</p> : history.rows.length === 0 ? <p className="adm-muted adm-small">No changes recorded yet.</p> : (
            <ul className="adm-timeline">
              {history.rows.map((e) => (
                <li key={e.id}>
                  <b>{AUDIT_LABELS[e.action] || e.action}</b>
                  <span className="adm-muted"> {auditSummary(e)}</span>
                  <div className="adm-small adm-muted">{fmtDateTime(e.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {confirm?.kind === 'lock' && (
        <ConfirmDialog
          title="Lock this school?"
          message={`${school.schoolName} will be locked out the next time their app checks in (usually within minutes). You can unlock them again any time.`}
          confirmLabel="Lock now"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={async () => { if (await act(() => setLock(school.licenseKey, true), 'Locked')) setConfirm(null); }}
        />
      )}
      {confirm?.kind === 'reset' && (
        <ConfirmDialog
          title="Free the key for a new computer?"
          message="The school can then activate this key on a different computer. Their old computer will stop working after its next check-in."
          confirmLabel="Free the key"
          onClose={() => setConfirm(null)}
          onConfirm={async () => { if (await act(() => resetDevice(school.licenseKey), 'Key is free to activate again')) setConfirm(null); }}
        />
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmDialog
          title="Delete this school?"
          message={`This removes ${school.schoolName} and its licence key permanently. Their app will stop working. The school's own student data is not touched. This cannot be undone.`}
          confirmLabel="Delete forever"
          danger
          typeToConfirm={school.schoolName}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const res = await deleteSchool(school.licenseKey);
            if (!res.ok) return toast(res.error || 'Could not delete.', 'err');
            toast('School deleted');
            onDeleted(school);
          }}
        />
      )}
    </aside>
  );
}

/** Shown once after a school is created, so the key is never lost. */
export function KeyCreatedModal({ school, onClose }) {
  const message = activationMessage(school);
  const whatsapp = school.phone ? `https://wa.me/${school.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}` : null;
  return (
    <Modal title="School created" onClose={onClose} footer={<button className="adm-btn adm-btn-primary" onClick={onClose}>Done</button>}>
      <p className="adm-muted">Send this key to {school.contactPerson || 'the school'}. It is also saved in the list.</p>
      <Field label="Licence key"><input className="adm-input adm-mono" readOnly value={school.licenseKey} onFocus={(e) => e.target.select()} /></Field>
      <Field label="Message to send"><textarea className="adm-input" readOnly rows={9} value={message} /></Field>
      <div className="adm-row adm-gap">
        <CopyButton text={school.licenseKey} label="Copy key" />
        <CopyButton text={message} label="Copy message" />
        {whatsapp && <a className="adm-btn adm-btn-sm" href={whatsapp} target="_blank" rel="noreferrer">Open WhatsApp</a>}
      </div>
    </Modal>
  );
}
