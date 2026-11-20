import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, RotateCcw, FolderOpen } from 'lucide-react';
import { getBackupConfig, saveBackupConfig, runBackupNow, listBackups, restoreBackup, getPrimaryBackupDir } from '../../lib/autoBackup';

const box = { marginTop: '12px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: '#ffffff' };
const small = { fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5 };

function whenFromName(name) {
  const m = name.match(/SMS-backup-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : name;
}

/** Settings → automatic daily backups: status, second folder, "back up now", and restore from a dated copy. */
export default function AutoBackupPanel() {
  const [cfg, setCfg] = useState(getBackupConfig());
  const [primary, setPrimary] = useState('');
  const [extra, setExtra] = useState(getBackupConfig().extraDir);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const refresh = useCallback(async () => {
    setCfg(getBackupConfig());
    try { setFiles(await listBackups()); } catch { setFiles([]); }
  }, []);

  useEffect(() => {
    getPrimaryBackupDir().then(setPrimary).catch(() => {});
    refresh();
    window.addEventListener('sms-backup-updated', refresh);
    return () => window.removeEventListener('sms-backup-updated', refresh);
  }, [refresh]);

  const backupNow = async () => {
    setBusy(true);
    setMsg(null);
    const res = await runBackupNow({ force: true });
    setBusy(false);
    setMsg(res.ok
      ? { ok: true, text: `Backup saved (${res.students} students).${getBackupConfig().lastError ? ' Problem with: ' + getBackupConfig().lastError : ''}` }
      : { ok: false, text: 'Backup failed: ' + (res.error || getBackupConfig().lastError || res.skipped) });
    refresh();
  };

  const saveExtra = () => {
    saveBackupConfig({ extraDir: extra.trim() });
    setMsg({ ok: true, text: extra.trim() ? 'Second backup folder saved. It is used from the next backup.' : 'Second backup folder removed.' });
    refresh();
  };

  const restore = async (f) => {
    if (!window.confirm(`Replace ALL current data with the backup from ${whenFromName(f.name)}?\n\nEverything entered after that time will be lost. Make a backup first if unsure.`)) return;
    setBusy(true);
    const res = await restoreBackup(f.dir, f.name).catch((e) => ({ ok: false, error: e.message || String(e) }));
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: 'Backup restored. Reloading…' });
      setTimeout(() => window.location.reload(), 1200);
    } else {
      setMsg({ ok: false, text: 'Restore failed: ' + res.error });
    }
  };

  const last = cfg.lastAt ? new Date(cfg.lastAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'not yet';
  const stale = cfg.enabled && cfg.lastAt && Date.now() - cfg.lastAt > 2 * 86400000;

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', color: 'var(--navy-950)' }}>
          <ShieldCheck size={16} color={cfg.lastOk === false || stale ? 'var(--status-absent)' : 'var(--status-present)'} />
          Automatic backup
        </div>
        <label style={{ ...small, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => { saveBackupConfig({ enabled: e.target.checked }); refresh(); }} />
          {cfg.enabled ? 'On' : 'Off'}
        </label>
      </div>

      <div style={{ ...small, marginTop: '6px' }}>
        Last backup: <strong>{last}</strong>
        {cfg.lastOk === false && <span style={{ color: 'var(--status-absent)' }}> — failed: {cfg.lastError}</span>}
        {stale && <span style={{ color: 'var(--status-absent)' }}> — older than 2 days, check the folder</span>}
        <br />
        A copy is saved every day and 30 minutes after any change. The newest 30 are kept in <code>{primary || 'Documents\\SMS Backups'}</code>.
      </div>

      <div style={{ marginTop: '10px', ...small }}>
        <strong>Second copy folder</strong> (recommended: a USB drive or your Google Drive / OneDrive folder):
        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
          <input
            className="form-input"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="e.g. E:\SMS Backup"
            style={{ flex: 1, fontSize: '12px' }}
          />
          <button type="button" className="btn btn-outline" onClick={saveExtra} style={{ fontSize: '11.5px' }}>
            <FolderOpen size={13} /> Save
          </button>
        </div>
      </div>

      <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button type="button" className="btn btn-primary" onClick={backupNow} disabled={busy} style={{ fontSize: '11.5px' }}>
          {busy ? 'Working…' : 'Back up now'}
        </button>
        {msg && <span style={{ fontSize: '11.5px', fontWeight: 600, color: msg.ok ? 'var(--status-present)' : 'var(--status-absent)' }}>{msg.text}</span>}
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ ...small, fontWeight: 700, marginBottom: '4px' }}>Restore from a saved copy</div>
          <div style={{ maxHeight: '170px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
            {files.slice(0, 40).map((f) => (
              <div key={f.dir + f.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', fontSize: '11.5px' }}>
                <span>{whenFromName(f.name)} <span style={{ color: 'var(--text-muted)' }}>· {(f.size / 1024).toFixed(0)} KB · {f.dir === primary ? 'this PC' : 'second folder'}</span></span>
                <button type="button" className="btn btn-outline" onClick={() => restore(f)} disabled={busy} style={{ fontSize: '11px', padding: '3px 8px' }}>
                  <RotateCcw size={12} /> Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
