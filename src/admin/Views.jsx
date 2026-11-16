import { useEffect, useMemo, useState } from 'react';
import { Badge, CopyButton } from './ui.jsx';
import { AUDIT_LABELS, auditSummary, expiryText, fmtDateTime, schoolState, timeAgo } from './format.js';
import { listAudit } from './api.js';

export function Dashboard({ schools, onOpen, onNavigate }) {
  const stats = useMemo(() => {
    const s = { total: schools.length, paid: 0, trial: 0, expiring: 0, expired: 0, locked: 0, notActivated: 0, students: 0 };
    for (const x of schools) {
      const st = schoolState(x);
      if (st.id === 'locked') s.locked++;
      else if (st.id === 'expired') s.expired++;
      else if (st.id === 'expiring') s.expiring++;
      else if (x.type === 'paid') s.paid++;
      else s.trial++;
      if (!x.boundDeviceId) s.notActivated++;
      s.students += x.maxStudents;
    }
    return s;
  }, [schools]);

  const attention = useMemo(
    () => schools.filter((x) => ['expiring', 'expired', 'locked'].includes(schoolState(x).id) || !x.boundDeviceId).slice(0, 8),
    [schools]
  );
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    let alive = true;
    listAudit(null, 8).then((r) => alive && r.ok && setRecent(r.audit));
    return () => { alive = false; };
  }, [schools]);

  const cards = [
    { label: 'Schools', value: stats.total, filter: 'all' },
    { label: 'Paid', value: stats.paid, tone: 'green', filter: 'paid' },
    { label: 'On trial', value: stats.trial, tone: 'blue', filter: 'trial' },
    { label: 'Ending in 7 days', value: stats.expiring, tone: 'amber', filter: 'expiring' },
    { label: 'Expired', value: stats.expired, tone: 'red', filter: 'expired' },
    { label: 'Locked', value: stats.locked, tone: 'red', filter: 'locked' },
  ];

  return (
    <>
      <div className="adm-stats">
        {cards.map((c) => (
          <button key={c.label} className="adm-stat" onClick={() => onNavigate('schools', c.filter)}>
            <span className="adm-stat-label">{c.label}</span>
            <span className={`adm-stat-value ${c.tone ? `tone-${c.tone}` : ''}`}>{c.value}</span>
          </button>
        ))}
      </div>

      <div className="adm-cols">
        <section className="adm-card">
          <h3>Needs attention</h3>
          {attention.length === 0 ? <p className="adm-muted">Nothing to do. All schools are healthy and activated.</p> : (
            <ul className="adm-list">
              {attention.map((x) => {
                const st = schoolState(x);
                return (
                  <li key={x.licenseKey}>
                    <button className="adm-list-btn" onClick={() => onOpen(x)}>
                      <span><b>{x.schoolName}</b><span className="adm-muted adm-small"> {!x.boundDeviceId && st.id === 'active' ? 'Key sent but not activated yet' : `Valid until ${expiryText(x)}`}</span></span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="adm-card">
          <h3>Recent activity</h3>
          {recent.length === 0 ? <p className="adm-muted">No changes recorded yet.</p> : (
            <ul className="adm-list">
              {recent.map((e) => (
                <li key={e.id} className="adm-list-row">
                  <span><b>{AUDIT_LABELS[e.action] || e.action}</b> <span className="adm-muted">· {e.school_name || '—'} {auditSummary(e)}</span></span>
                  <span className="adm-muted adm-small">{timeAgo(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <button className="adm-link" onClick={() => onNavigate('activity')}>See all activity →</button>
        </section>
      </div>
    </>
  );
}

const FILTERS = [
  ['all', 'All'], ['paid', 'Paid'], ['trial', 'Trial'], ['expiring', 'Ending soon'], ['expired', 'Expired'], ['locked', 'Locked'], ['inactive', 'Not activated'],
];
const SORTS = {
  newest: ['Newest first', (a, b) => new Date(b.createdAt) - new Date(a.createdAt)],
  name: ['Name A–Z', (a, b) => a.schoolName.localeCompare(b.schoolName)],
  expiry: ['Ending soonest', (a, b) => (a.isLifetime - b.isLifetime) || (a.daysRemaining - b.daysRemaining)],
  seen: ['Last check-in', (a, b) => new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0)],
};

export function SchoolsView({ schools, initialFilter = 'all', selectedKey, onOpen, onAdd }) {
  const [filter, setFilter] = useState(initialFilter);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return schools
      .filter((s) => {
        const st = schoolState(s);
        if (filter === 'paid') return s.type === 'paid' && st.id === 'active';
        if (filter === 'trial') return s.type === 'trial' && st.id === 'active';
        if (filter === 'inactive') return !s.boundDeviceId;
        return filter === 'all' || st.id === filter;
      })
      .filter((s) => !q || [s.schoolName, s.licenseKey, s.contactPerson, s.email, s.phone].some((v) => (v || '').toLowerCase().includes(q)))
      .sort(SORTS[sort][1]);
  }, [schools, filter, query, sort]);

  return (
    <section className="adm-card">
      <div className="adm-toolbar">
        <input className="adm-input adm-search" placeholder="Search name, key, contact…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search schools" />
        <select className="adm-input adm-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <button className="adm-btn adm-btn-primary" onClick={onAdd}>+ Add school</button>
      </div>
      <div className="adm-chips adm-chips-row">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={`adm-chip ${filter === id ? 'is-on' : ''}`} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="adm-empty">
          <p>{schools.length === 0 ? 'No schools yet.' : 'No schools match this filter.'}</p>
          {schools.length === 0 && <button className="adm-btn adm-btn-primary" onClick={onAdd}>Add your first school</button>}
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr><th>School</th><th>Status</th><th>Valid until</th><th>Students</th><th>Computer</th><th>Last check-in</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const st = schoolState(s);
                return (
                  <tr key={s.licenseKey} className={s.licenseKey === selectedKey ? 'is-selected' : ''} onClick={() => onOpen(s)}>
                    <td>
                      <b>{s.schoolName}</b>
                      <div className="adm-muted adm-small adm-mono">{s.licenseKey}</div>
                    </td>
                    <td><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td>{expiryText(s)}</td>
                    <td>{s.maxStudents.toLocaleString()}</td>
                    <td>{s.boundDeviceId ? 'Activated' : <span className="adm-muted">Not yet</span>}</td>
                    <td>{timeAgo(s.lastSeenAt)}</td>
                    <td onClick={(e) => e.stopPropagation()}><CopyButton text={s.licenseKey} label="Copy key" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="adm-muted adm-small">{rows.length} of {schools.length} schools</p>
    </section>
  );
}

export function ActivityView() {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [action, setAction] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    listAudit(null, 300).then((r) => alive && setState({ loading: false, rows: r.ok ? r.audit : [], error: r.ok ? '' : r.error }));
    return () => { alive = false; };
  }, []);

  const rows = state.rows.filter((e) =>
    (action === 'all' || e.action === action) &&
    (!query.trim() || `${e.school_name} ${e.license_key}`.toLowerCase().includes(query.trim().toLowerCase())));

  return (
    <section className="adm-card">
      <div className="adm-toolbar">
        <input className="adm-input adm-search" placeholder="Search school or key…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search activity" />
        <select className="adm-input adm-select" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
          <option value="all">All actions</option>
          {Object.entries(AUDIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {state.loading ? <p className="adm-muted">Loading…</p> : state.error ? (
        <div className="adm-alert adm-alert-red">{state.error} (Did you run the audit-log migration?)</div>
      ) : rows.length === 0 ? <p className="adm-muted">No matching activity.</p> : (
        <div className="adm-table-wrap">
          <table className="adm-table adm-table-static">
            <thead><tr><th>When</th><th>Action</th><th>School</th><th>Details</th><th>From</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDateTime(e.created_at)}</td>
                  <td><b>{AUDIT_LABELS[e.action] || e.action}</b></td>
                  <td>{e.school_name || '—'}<div className="adm-muted adm-small adm-mono">{e.license_key}</div></td>
                  <td>{auditSummary(e)}</td>
                  <td className="adm-muted adm-small">{e.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function SharedKeysView({ keys, onOpen }) {
  return (
    <section className="adm-card">
      <p className="adm-muted">These two keys are shared with every school: the 30-day trial and the 5-day emergency grace. Each computer can use them once. You can lock a key for everyone, or reset its computer list.</p>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Key</th><th>Purpose</th><th>Status</th><th>Computers</th><th /></tr></thead>
          <tbody>
            {keys.map((k) => {
              const st = schoolState(k);
              return (
                <tr key={k.licenseKey} onClick={() => onOpen(k)}>
                  <td><b className="adm-mono">{k.licenseKey}</b></td>
                  <td>{k.kind === 'grace' ? '5-day emergency grace' : '30-day free trial'}</td>
                  <td><Badge tone={st.tone}>{st.id === 'active' ? 'In use' : st.label}</Badge></td>
                  <td>{k.deviceGrantCount}</td>
                  <td onClick={(e) => e.stopPropagation()}><CopyButton text={k.licenseKey} label="Copy key" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
