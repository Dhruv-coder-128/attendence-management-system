/**
 * Automatic backups (School PC / desktop app only).
 *
 * The school's data lives only on its own PC, so a dead disk would lose everything. This keeps dated copies:
 *   1. in "Documents\SMS Backups" (always), and
 *   2. in a second folder the school picks (USB drive, Google Drive / OneDrive folder), if set.
 * Rules: at least one backup every 24 hours; also 30 minutes after any change. The newest 30 are kept.
 * Backups are never made from an empty database (that would push good copies out).
 */
import { createBackupObject, importDatabaseBackup } from './databaseAdapter.js';
import { isTauriDesktop } from './licenseService.js';

const CONFIG_KEY = 'sms_auto_backup';
const KEEP = 30;
const DAY = 86400000;
const MIN_GAP_AFTER_CHANGE = 30 * 60000;

async function invoke(cmd, args) {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke(cmd, args);
}

export function getBackupConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    return { enabled: c.enabled !== false, extraDir: c.extraDir || '', lastAt: c.lastAt || 0, lastOk: c.lastOk ?? null, lastError: c.lastError || '', lastDirs: c.lastDirs || [] };
  } catch {
    return { enabled: true, extraDir: '', lastAt: 0, lastOk: null, lastError: '', lastDirs: [] };
  }
}

export function saveBackupConfig(patch) {
  const next = { ...getBackupConfig(), ...patch };
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('sms-backup-updated'));
  } catch {}
  return next;
}

export const getPrimaryBackupDir = () => invoke('backup_default_dir');

/** "SMS-backup-2026-11-20_1430.smsdb" (local time; sorts newest-first by name). */
export function backupFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `SMS-backup-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}.smsdb`;
}

/** Writes a backup now. `force` also backs up an empty database (manual button only). */
export async function runBackupNow({ force = false } = {}) {
  if (!isTauriDesktop()) return { ok: false, skipped: 'not-desktop' };
  const cfg = getBackupConfig();
  try {
    const backup = await createBackupObject();
    const rows = (backup.tables.students?.length || 0) + (backup.tables.batches?.length || 0);
    if (rows === 0 && !force) return { ok: false, skipped: 'empty' };

    const primary = await getPrimaryBackupDir();
    const dirs = [primary, cfg.extraDir].filter(Boolean);
    const res = await invoke('write_backup', { dirs, filename: backupFileName(), content: JSON.stringify(backup), keep: KEEP });
    const failed = (res.results || []).filter((r) => !r.ok);
    const anyOk = (res.results || []).some((r) => r.ok);
    saveBackupConfig({
      lastAt: anyOk ? Date.now() : cfg.lastAt,
      lastOk: anyOk,
      lastDirs: (res.results || []).filter((r) => r.ok).map((r) => r.dir),
      lastError: failed.map((r) => `${r.dir}: ${r.error}`).join(' | '),
    });
    return { ok: anyOk, results: res.results, students: backup.tables.students?.length || 0 };
  } catch (err) {
    saveBackupConfig({ lastOk: false, lastError: String(err?.message || err) });
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function listBackups() {
  const cfg = getBackupConfig();
  const dirs = [await getPrimaryBackupDir(), cfg.extraDir].filter(Boolean);
  const out = [];
  for (const dir of dirs) {
    try {
      (await invoke('list_backups', { dir })).forEach((b) => out.push({ ...b, dir }));
    } catch {
      // folder missing or drive unplugged: just not listed
    }
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

/** Replaces ALL current data with the chosen backup. The caller reloads the app afterwards. */
export async function restoreBackup(dir, name) {
  const text = await invoke('read_backup', { dir, name });
  return importDatabaseBackup(text);
}

/** Starts the schedule. Returns a stop function. */
export function startAutoBackup() {
  if (!isTauriDesktop()) return () => {};
  let dirty = false;
  let running = false;
  const markDirty = () => { dirty = true; };
  window.addEventListener('sms-db-mutation', markDirty);

  const tick = async () => {
    const cfg = getBackupConfig();
    if (!cfg.enabled || running) return;
    const age = Date.now() - cfg.lastAt;
    if (age >= DAY || (dirty && age >= MIN_GAP_AFTER_CHANGE)) {
      running = true;
      const res = await runBackupNow();
      if (res.ok || res.skipped === 'empty') dirty = false;
      running = false;
    }
  };
  const first = setTimeout(tick, 20000); // let the app finish starting first
  const timer = setInterval(tick, 5 * 60000);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
    window.removeEventListener('sms-db-mutation', markDirty);
  };
}
