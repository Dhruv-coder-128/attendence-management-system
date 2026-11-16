import { useCallback, useEffect, useMemo, useState } from 'react';
import './admin.css';
import { ToastProvider, useToast, Field } from './ui.jsx';
import { getSecret, listSchools, setSecret } from './api.js';
import { ActivityView, Dashboard, SchoolsView, SharedKeysView } from './Views.jsx';
import SchoolForm from './SchoolForm.jsx';
import SchoolDetail, { KeyCreatedModal } from './SchoolDetail.jsx';

function Login({ onSignedIn }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSecret(value.trim());
    const res = await listSchools();
    setBusy(false);
    if (!res.ok) {
      setSecret('');
      return setError(res.httpStatus === 401 ? 'That secret is not correct.' : res.error || 'Could not sign in.');
    }
    onSignedIn(res.licenses);
  };

  return (
    <div className="adm-login">
      <form className="adm-login-card" onSubmit={submit}>
        <div className="adm-logo">SMS</div>
        <h1>Admin panel</h1>
        <p className="adm-muted">Enter your developer secret to manage schools and licences.</p>
        {error && <div className="adm-alert adm-alert-red">{error}</div>}
        <Field label="Developer secret">
          <input className="adm-input" type="password" autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
        <button className="adm-btn adm-btn-primary adm-btn-block" disabled={busy || !value.trim()}>{busy ? 'Checking…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

const NAV = [
  ['dashboard', 'Dashboard', '▦'],
  ['schools', 'Schools', '🏫'],
  ['activity', 'Activity', '🕘'],
  ['shared', 'Shared keys', '🔑'],
];
const TITLES = { dashboard: 'Dashboard', schools: 'Schools', activity: 'Activity log', shared: 'Shared keys' };

function Shell({ initial, onSignOut }) {
  const toast = useToast();
  const [all, setAll] = useState(initial);
  const [view, setView] = useState('dashboard');
  const [filter, setFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState(null);
  const [form, setForm] = useState(null); // { school? }
  const [created, setCreated] = useState(null);
  const [loading, setLoading] = useState(false);

  const schools = useMemo(() => all.filter((s) => s.kind === 'school'), [all]);
  const shared = useMemo(() => all.filter((s) => s.kind !== 'school'), [all]);
  const selected = all.find((s) => s.licenseKey === selectedKey) || null;

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await listSchools();
    setLoading(false);
    if (res.httpStatus === 401) return onSignOut();
    if (!res.ok) return toast(res.error || 'Could not refresh.', 'err');
    setAll(res.licenses);
  }, [onSignOut, toast]);

  // Keep the list fresh: schools check in on their own while the panel is open.
  useEffect(() => {
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [refresh]);

  const upsert = (lic) => setAll((prev) => (prev.some((s) => s.licenseKey === lic.licenseKey) ? prev.map((s) => (s.licenseKey === lic.licenseKey ? lic : s)) : [lic, ...prev]));
  const go = (v, f = 'all') => { setView(v); setFilter(f); setSelectedKey(null); };

  return (
    <div className="adm-shell">
      <nav className="adm-sidebar" aria-label="Main">
        <div className="adm-brand"><span className="adm-logo adm-logo-sm">SMS</span> Admin</div>
        {NAV.map(([id, label, icon]) => (
          <button key={id} className={`adm-nav ${view === id ? 'is-on' : ''}`} onClick={() => go(id)}>
            <span aria-hidden="true">{icon}</span> {label}
          </button>
        ))}
        <div className="adm-sidebar-foot">
          <button className="adm-nav" onClick={onSignOut}>Sign out</button>
        </div>
      </nav>

      <main className={`adm-main ${selected ? 'has-panel' : ''}`}>
        <header className="adm-topbar">
          <h1>{TITLES[view]}</h1>
          <div className="adm-row adm-gap">
            <button className="adm-btn" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
            <button className="adm-btn adm-btn-primary" onClick={() => setForm({})}>+ Add school</button>
          </div>
        </header>

        <div className="adm-content">
          {view === 'dashboard' && <Dashboard schools={schools} onOpen={(s) => { setView('schools'); setSelectedKey(s.licenseKey); }} onNavigate={go} />}
          {view === 'schools' && <SchoolsView key={filter} schools={schools} initialFilter={filter} selectedKey={selectedKey} onOpen={(s) => setSelectedKey(s.licenseKey)} onAdd={() => setForm({})} />}
          {view === 'activity' && <ActivityView />}
          {view === 'shared' && <SharedKeysView keys={shared} onOpen={(s) => setSelectedKey(s.licenseKey)} />}
        </div>
      </main>

      {selected && (
        <SchoolDetail
          key={selected.licenseKey}
          school={selected}
          onChanged={upsert}
          onEdit={(s) => setForm({ school: s })}
          onDeleted={(s) => { setAll((prev) => prev.filter((x) => x.licenseKey !== s.licenseKey)); setSelectedKey(null); }}
          onClose={() => setSelectedKey(null)}
        />
      )}

      {form && (
        <SchoolForm
          school={form.school}
          onClose={() => setForm(null)}
          onSaved={(lic, isNew) => {
            upsert(lic);
            setForm(null);
            if (isNew) { setCreated(lic); setView('schools'); setFilter('all'); setSelectedKey(lic.licenseKey); }
          }}
        />
      )}
      {created && <KeyCreatedModal school={created} onClose={() => setCreated(null)} />}
    </div>
  );
}

export default function AdminApp() {
  const [schools, setSchools] = useState(null);
  const [checking, setChecking] = useState(Boolean(getSecret()));

  useEffect(() => {
    document.title = 'SMS Admin';
    if (!getSecret()) return;
    listSchools().then((res) => {
      if (res.ok) setSchools(res.licenses);
      else setSecret('');
      setChecking(false);
    });
  }, []);

  const signOut = useCallback(() => { setSecret(''); setSchools(null); }, []);

  return (
    <ToastProvider>
      {checking ? <div className="adm-login"><p className="adm-muted">Loading…</p></div>
        : schools ? <Shell initial={schools} onSignOut={signOut} />
        : <Login onSignedIn={setSchools} />}
    </ToastProvider>
  );
}
