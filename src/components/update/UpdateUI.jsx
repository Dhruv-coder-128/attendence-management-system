import React, { useEffect, useState } from 'react';
import { DownloadCloud, RefreshCw, CheckCircle2 } from 'lucide-react';
import { CURRENT_VERSION, checkForUpdate, getUpdateState, installUpdate, startUpdateChecks, subscribeUpdates } from '../../lib/appUpdater';
import { isTauriDesktop } from '../../lib/licenseService';

function useUpdateState() {
  const [s, setS] = useState(getUpdateState());
  useEffect(() => subscribeUpdates(setS), []);
  return s;
}

/** Slim bar at the top of every screen when a newer version is ready, and while it installs. */
export function UpdateBanner() {
  const s = useUpdateState();
  const [dismissedFor, setDismissedFor] = useState('');
  useEffect(() => startUpdateChecks(), []);

  if (!isTauriDesktop()) return null;
  const busy = s.status === 'downloading' || s.status === 'installing';
  if (!busy && !(s.status === 'available' && dismissedFor !== s.version)) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100000, display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: '12px', padding: '8px 16px', background: '#0a1424', color: '#fff',
        fontSize: '13px', borderBottom: '2px solid #c5a880',
      }}
    >
      <DownloadCloud size={16} color="#c5a880" />
      {s.status === 'available' && (
        <>
          {s.installError
            ? <span>Update {s.version} could not be installed ({s.installError.slice(0, 90)}). Your data is safe.</span>
            : <span>Update <strong>{s.version}</strong> is available. Your data stays safe.</span>}
          <button type="button" onClick={installUpdate} style={{ background: '#c5a880', color: '#0a1424', border: 'none', borderRadius: '6px', padding: '4px 12px', fontWeight: 700, cursor: 'pointer' }}>
            {s.installError ? 'Try again' : 'Update now'}
          </button>
          <button type="button" onClick={() => setDismissedFor(s.version)} style={{ background: 'transparent', color: '#cbd5e1', border: '1px solid #475569', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}>
            Later
          </button>
        </>
      )}
      {s.status === 'downloading' && <span>Downloading update… {s.progress || 0}% — please keep the app open.</span>}
      {s.status === 'installing' && <span>Installing update. The app will restart in a moment…</span>}
    </div>
  );
}

/** Settings → software version and a manual "Check for updates" button. */
export function UpdatePanel() {
  const s = useUpdateState();
  if (!isTauriDesktop()) return null;
  const checking = s.status === 'checking';
  return (
    <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: '#ffffff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--navy-950)' }}>
          Software version <span style={{ fontFamily: 'monospace' }}>{CURRENT_VERSION || '—'}</span>
        </div>
        <button type="button" className="btn btn-outline" onClick={checkForUpdate} disabled={checking} style={{ fontSize: '11.5px' }}>
          <RefreshCw size={13} className={checking ? 'animate-spin' : ''} /> {checking ? 'Checking…' : 'Check for updates'}
        </button>
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
        {s.status === 'current' && <span style={{ color: 'var(--status-present)' }}><CheckCircle2 size={12} style={{ verticalAlign: '-2px' }} /> You have the latest version.</span>}
        {s.status === 'available' && <span>Version <strong>{s.version}</strong> is available — use the bar at the top to install it.</span>}
        {s.status === 'error' && <span>Could not check right now (no internet or no new release yet).</span>}
        {(s.status === 'idle' || checking) && <span>New versions are found automatically; your data is never touched by an update.</span>}
      </div>
    </div>
  );
}
