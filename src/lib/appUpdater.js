/**
 * Automatic updates (School PC / desktop app only), using Tauri's signed updater.
 * The app looks for a newer version a short while after start and every 6 hours. Only packages signed with the
 * developer's private updater key are accepted (the public half is built into the app).
 * The school's data is not touched by an update; a backup is made right before installing anyway.
 */
import { isTauriDesktop } from './licenseService.js';
import { runBackupNow } from './autoBackup.js';

export const CURRENT_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';

let state = { status: 'idle' }; // idle | checking | current | available | downloading | installing | error
let pending = null;
const listeners = new Set();

function set(next) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

export const getUpdateState = () => state;
export function subscribeUpdates(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Asks the update server whether a newer version exists. Never throws. */
export async function checkForUpdate() {
  if (!isTauriDesktop()) return state;
  if (state.status === 'downloading' || state.status === 'installing') return state;
  set({ status: 'checking', error: '' });
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: 20000 });
    if (update) {
      pending = update;
      set({ status: 'available', version: update.version, notes: update.body || '', checkedAt: Date.now() });
    } else {
      pending = null;
      set({ status: 'current', checkedAt: Date.now() });
    }
  } catch (err) {
    // No internet, or no release published yet: not an error the school needs to worry about.
    set({ status: 'error', error: String(err?.message || err), checkedAt: Date.now() });
  }
  return state;
}

/** Downloads and installs the update found by checkForUpdate(). The app restarts itself afterwards. */
export async function installUpdate() {
  if (!pending) return state;
  try {
    set({ status: 'downloading', progress: 0, error: '', installError: '' });
    await runBackupNow().catch(() => {}); // safety copy of the school's data first
    let total = 0;
    let done = 0;
    await pending.downloadAndInstall((ev) => {
      if (ev.event === 'Started') total = ev.data?.contentLength || 0;
      else if (ev.event === 'Progress') {
        done += ev.data?.chunkLength || 0;
        set({ progress: total ? Math.min(99, Math.round((done / total) * 100)) : 0 });
      } else if (ev.event === 'Finished') set({ status: 'installing', progress: 100 });
    });
    set({ status: 'installing', progress: 100 });
  } catch (err) {
    // Stay on "available" so the school can retry; the message says why (no internet, file damaged, wrong signature).
    set({ status: 'available', installError: String(err?.message || err) });
  }
  return state;
}

/** Starts the schedule. Returns a stop function. */
export function startUpdateChecks() {
  if (!isTauriDesktop()) return () => {};
  const first = setTimeout(checkForUpdate, 45000);
  const timer = setInterval(checkForUpdate, 6 * 3600000);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
