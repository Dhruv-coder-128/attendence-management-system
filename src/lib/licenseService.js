/**
 * SMS — Student Management System
 * Client-Side License & 30-Day Trial Service
 * 
 * Enforces server-controlled 30-day trial lifecycle, anti-clock-tampering protection,
 * multi-school database mapping, and configurable developer contact actions.
 */

import { Capacitor } from '@capacitor/core';
import { getHardwareFingerprint } from './hardwareFingerprint.js';

const STORAGE_KEY = 'sms_school_license';
export const DEFAULT_DEV_CONTACT = {
  name: 'Dhruv Shah',
  email: 'dushah2007@gmail.com',
  phone: '+91 8866039007',
  whatsapp: '+91 8866039007',
};

export const UNIVERSAL_TRIAL_KEY = 'SMS-FREE-TRIAL-30D';
export const UNIVERSAL_GRACE_KEY = 'SMS-GRACE-5D';

export const STUDENT_CAPACITY_TIERS = [
  { id: 'tier_200', name: 'Tier 1 — Starter', maxStudents: 200, label: 'Up to 200 Students' },
  { id: 'tier_500', name: 'Tier 2 — Growth', maxStudents: 500, label: 'Up to 500 Students' },
  { id: 'tier_1000', name: 'Tier 3 — Pro', maxStudents: 1000, label: 'Up to 1,000 Students' },
  { id: 'tier_5000', name: 'Tier 4 — Enterprise', maxStudents: 5000, label: '5,000+ Students (Unlimited)' },
];

export function getStudentCapacityTier(maxStudents) {
  const count = parseInt(maxStudents, 10);
  if (!count || count <= 200) return STUDENT_CAPACITY_TIERS[0];
  if (count <= 500) return STUDENT_CAPACITY_TIERS[1];
  if (count <= 1000) return STUDENT_CAPACITY_TIERS[2];
  return STUDENT_CAPACITY_TIERS[3];
}

export function getMaxStudentCapacity() {
  const lic = getStoredLicense();
  if (!lic) return 5000;
  if (lic.maxStudents !== undefined && lic.maxStudents !== null) {
    return parseInt(lic.maxStudents, 10) || 200;
  }
  return 5000;
}

export function checkStudentCapacityAllowed(currentCount, addingCount = 1) {
  const max = getMaxStudentCapacity();
  if (max >= 5000) {
    return {
      allowed: true,
      maxStudents: Infinity,
      isUnlimited: true,
      currentCount,
      available: Infinity,
      tier: STUDENT_CAPACITY_TIERS[3],
    };
  }
  const allowed = (currentCount + addingCount) <= max;
  return {
    allowed,
    maxStudents: max,
    isUnlimited: false,
    currentCount,
    available: Math.max(0, max - currentCount),
    tier: getStudentCapacityTier(max),
  };
}

/**
 * Detects if currently executing inside the Tauri Windows Desktop wrapper
 */
export function isTauriDesktop() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.__TAURI_INTERNALS__ ||
    window.__TAURI__ ||
    (typeof window.__TAURI_METADATA__ !== 'undefined')
  );
}

export const PRODUCTION_API_URL = 'https://attendence-management-system-lovat.vercel.app';

/**
 * Production HTTPS server URL for desktop app and Android app to reach serverless licensing APIs
 */
export function getApiBaseUrl() {
  if (typeof window === 'undefined') return '';
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRODUCTION_API_URL) || '';
  if (envUrl) return envUrl.replace(/\/+$/, '');

  // If in desktop app or native mobile APK, connect to deployed production Vercel HTTPS domain
  if (isTauriDesktop() || Capacitor.isNativePlatform()) {
    return PRODUCTION_API_URL;
  }

  // In web app, use relative paths to the same origin
  return '';
}

/**
 * Retrieves the currently active school license record from local storage
 */
export function getStoredLicense() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.trialEndsAt && (parsed.daysRemaining || 0) < 9000) {
      const diffMs = new Date(parsed.trialEndsAt).getTime() - Date.now();
      parsed.daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Saves or updates the local license cache
 */
export function saveStoredLicense(data) {
  if (typeof window === 'undefined' || !data) return;
  try {
    const existing = getStoredLicense() || {};
    const shouldResetLock = (data.status === 'trial_active' || data.status === 'licensed') && data.isLocked === undefined;
    const merged = {
      ...existing,
      ...data,
      isLocked: shouldResetLock ? false : (data.isLocked !== undefined ? data.isLocked : Boolean(existing.isLocked)),
      cachedAtLocal: Date.now(),
      cachedPerformanceNow: performance.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn('Failed to save license to localStorage:', err);
  }
}

/**
 * Clears stored license (e.g. for re-activation or switching school)
 */
export function clearStoredLicense() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Developer license administration. Every call goes to /api/license-manage with the developer secret,
 * which is typed in the Master Console and kept only in sessionStorage (never shipped in the build).
 */
const DEV_SECRET_KEY = 'sms_dev_secret';
export const getDeveloperSecret = () => { try { return sessionStorage.getItem(DEV_SECRET_KEY) || ''; } catch { return ''; } };
export const setDeveloperSecret = (v) => {
  try {
    if (v) sessionStorage.setItem(DEV_SECRET_KEY, v);
    else sessionStorage.removeItem(DEV_SECRET_KEY);
  } catch {}
};

async function manageApi(body) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/license-manage`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'x-developer-secret': getDeveloperSecret() },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({ ok: false, error: `Server returned HTTP ${res.status}` }));
    return { ...data, httpStatus: res.status };
  } catch (err) {
    return { ok: false, error: 'Cannot reach the licensing server: ' + (err?.message || err), httpStatus: 0 };
  }
}

const withTier = (l) => (l ? { ...l, tier: getStudentCapacityTier(l.maxStudents) } : l);

/** Returns { ok, licenses, error, httpStatus }. */
export async function fetchCloudLicenses() {
  const res = await manageApi();
  return { ...res, licenses: (res.licenses || []).map(withTier) };
}

export async function saveCloudLicense(clientObj) {
  const res = await manageApi({ action: 'upsert', licenseKey: clientObj.licenseKey, license: clientObj });
  return { ...res, data: withTier(res.license) };
}

const licenseAction = (action, extra) => async (licenseKey, ...args) => {
  const res = await manageApi({ action, licenseKey, ...extra(...args) });
  return { ...res, ...(res.license ? withTier(res.license) : {}) };
};

export const updateCloudLicenseTier = licenseAction('set_tier', (maxStudents) => ({ maxStudents }));
export const adjustCloudLicenseDays = licenseAction('set_days', (days, exact = false) => ({ days, exact }));
export const setCloudLicenseLock = licenseAction('set_lock', (locked) => ({ locked }));
export const setCloudLicenseTimer = licenseAction('set_timer', (visible) => ({ visible }));
export const unbindCloudHardware = licenseAction('reset_device', () => ({}));
export const deleteCloudLicense = licenseAction('delete', () => ({}));

/** Maps a server license response to the shape cached in localStorage. */
function toStored(data, hwid) {
  return {
    licenseKey: data.licenseKey,
    licenseId: data.licenseId,
    schoolName: data.schoolName,
    status: data.status,
    daysRemaining: data.daysRemaining,
    maxStudents: data.maxStudents,
    tier: getStudentCapacityTier(data.maxStudents),
    isTimerVisible: data.isTimerVisible,
    trialStartedAt: data.trialStartedAt,
    trialEndsAt: data.trialEndsAt,
    boundDeviceId: hwid,
    ...(data.databaseConfig ? { databaseConfig: data.databaseConfig } : {}),
    developerContact: data.developerContact || DEFAULT_DEV_CONTACT,
    lastServerSync: data.serverTime || new Date().toISOString(),
    isLocked: false,
  };
}

function syncSchoolNameToSettings(schoolName) {
  if (typeof window === 'undefined' || !schoolName) return;
  try {
    const parsedSettings = JSON.parse(localStorage.getItem('sms_academy_settings') || '{}');
    parsedSettings.academy_name = schoolName;
    localStorage.setItem('sms_academy_settings', JSON.stringify(parsedSettings));
    localStorage.setItem('erp_institute_name', schoolName);
    window.dispatchEvent(new CustomEvent('sms_academy_settings_updated', { detail: parsedSettings }));
  } catch {}
}

/**
 * Activates a license key on this device through /api/license-activate.
 * The server enforces single-device binding and one-time trial/grace grants.
 */
export async function activateSchoolLicense(licenseKey) {
  const cleanKey = String(licenseKey || '').trim().toUpperCase();
  if (!cleanKey) return { ok: false, error: 'License key is required.' };

  const hwid = await getHardwareFingerprint();
  let data;
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/license-activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: cleanKey, deviceId: hwid }),
    });
    data = await res.json();
  } catch {
    return { ok: false, error: 'Cannot reach the licensing server. Please connect to the internet to activate.' };
  }
  if (!data?.ok) return { ok: false, error: data?.error || 'Activation failed.', status: data?.status };

  const stored = toStored(data, hwid);
  saveStoredLicense(stored);
  syncSchoolNameToSettings(stored.schoolName);
  return { ok: true, data: stored };
}

/**
 * Connects this installation to the school's own Supabase project.
 * The license key is still activated on the server first; only the database settings are local.
 */
export async function configureCustomSchoolDatabase({ supabaseUrl, supabaseAnonKey, licenseKey }) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: 'Database URL and Publishable Anon Key are required.' };
  }
  const activated = await activateSchoolLicense(licenseKey);
  if (!activated.ok) return activated;
  const data = {
    ...activated.data,
    databaseConfig: { supabaseUrl: supabaseUrl.trim().replace(/\/+$/, ''), supabaseAnonKey: supabaseAnonKey.trim() },
    isCustomSchoolDb: true,
  };
  saveStoredLicense(data);
  return { ok: true, data };
}

const LOCKED_STATUSES = ['trial_expired', 'suspended', 'hardware_mismatch', 'unlicensed', 'invalid'];

/**
 * Validates the stored license with /api/license-validate.
 * When the server cannot be reached, the cached lease is used (with clone and clock-rollback checks).
 */
export async function validateLicense(options = {}) {
  const cached = getStoredLicense();

  // On native mobile APK, teachers take roll call over Wi-Fi and are never locked out
  if (Capacitor.isNativePlatform()) {
    return { ok: true, status: 'teacher_mobile_mode', daysRemaining: 9999, isTrialExpired: false, isLocked: false, developerContact: DEFAULT_DEV_CONTACT };
  }

  if (!cached?.licenseKey) {
    if (!isTauriDesktop() && !options.requireLicense) {
      return { ok: true, status: 'web_env_mode', daysRemaining: 9999, isTrialExpired: false, developerContact: DEFAULT_DEV_CONTACT };
    }
    return {
      ok: false, status: 'unlicensed', isTrialExpired: false, isLocked: true,
      error: 'No active school license found. Please enter your School License Key to activate.',
      developerContact: DEFAULT_DEV_CONTACT,
    };
  }

  const currentHwid = await getHardwareFingerprint();
  const developerContact = cached.developerContact || DEFAULT_DEV_CONTACT;
  const lockout = (status, error, extra = {}) => {
    saveStoredLicense({ ...cached, status, daysRemaining: 0, isLocked: true });
    return { ok: false, status, isTrialExpired: true, isLocked: true, error, developerContact, ...extra };
  };

  // Anti-cloning: the cached license belongs to a different machine.
  if (cached.boundDeviceId && currentHwid && cached.boundDeviceId !== currentHwid) {
    return lockout('cloned_copy_detected', 'This installation was copied from another computer. Contact the developer to authorize this computer.', { currentHwid, boundDeviceId: cached.boundDeviceId });
  }

  let data = null;
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/license-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: cached.licenseKey, deviceId: currentHwid }),
    });
    // 5xx / 429 = server problem, not the school's fault: fall back to the offline lease.
    if (res.status < 500 && res.status !== 429) data = await res.json();
  } catch (netErr) {
    console.warn('Licensing server unreachable, using offline lease:', netErr.message);
  }

  if (data?.ok) {
    const stored = { ...cached, ...toStored(data, currentHwid) };
    saveStoredLicense(stored);
    return {
      ok: true, status: data.status, schoolName: data.schoolName, daysRemaining: data.daysRemaining,
      maxStudents: data.maxStudents, tier: stored.tier, isTimerVisible: data.isTimerVisible,
      isTrialExpired: false, isLocked: false, trialEndsAt: data.trialEndsAt, developerContact: data.developerContact || developerContact,
    };
  }
  if (data) {
    const status = LOCKED_STATUSES.includes(data.status) ? data.status : 'invalid';
    return lockout(status, data.error || 'License validation failed.', { trialEndsAt: data.trialEndsAt });
  }

  // ---- Offline lease ----
  if (cached.isLocked || ['suspended', 'trial_expired', 'hardware_mismatch', 'invalid', 'unlicensed'].includes(cached.status)) {
    return { ok: false, status: cached.status || 'suspended', isTrialExpired: true, isLocked: true, error: 'This installation is locked. Please connect to the internet to re-check your license.', developerContact };
  }
  const nowMs = Date.now();
  const lastSyncMs = cached.lastServerSync ? new Date(cached.lastServerSync).getTime() : 0;
  if (nowMs < lastSyncMs - 60000) {
    return { ok: false, status: 'clock_tampered', isTrialExpired: true, isLocked: true, error: 'System clock discrepancy detected. Please connect to the internet to verify your SMS license.', developerContact };
  }
  if (cached.trialEndsAt && new Date(cached.trialEndsAt).getTime() <= nowMs) {
    return lockout('trial_expired', 'Your license period has ended. Contact the developer to renew SMS.', { trialEndsAt: cached.trialEndsAt });
  }
  return {
    ok: true, status: cached.status || 'trial_active', schoolName: cached.schoolName,
    daysRemaining: cached.trialEndsAt ? Math.max(0, Math.ceil((new Date(cached.trialEndsAt).getTime() - nowMs) / 86400000)) : 9999,
    isTrialExpired: false, isOfflineLease: true, developerContact,
  };
}

/**
 * Returns formatted Contact Developer URL (mailto, tel, or WhatsApp)
 */
export function getContactDeveloperLinks(customContact) {
  const contact = customContact || getStoredLicense()?.developerContact || DEFAULT_DEV_CONTACT;
  const cleanPhone = (contact.phone || contact.whatsapp || '+91 8866039007').replace(/[^0-9+]/g, '');
  const cleanEmail = contact.email || 'dushah2007@gmail.com';
  const rawWa = (contact.whatsapp || contact.phone || '8866039007').replace(/[^0-9]/g, '');
  const waNumber = rawWa.length === 10 ? `91${rawWa}` : rawWa;

  const waMessage = encodeURIComponent(
    `Hello ${contact.name || 'Developer'}, I am using SMS — Student Management System. I need assistance with a school license key or technical support.`
  );

  return {
    name: contact.name || 'Dhruv Shah',
    email: cleanEmail,
    emailLink: `mailto:${cleanEmail}?subject=${encodeURIComponent('SMS — School License Activation Request')}`,
    phone: contact.phone || '+91 8866039007',
    phoneLink: cleanPhone ? `tel:${cleanPhone}` : 'tel:+918866039007',
    whatsappLink: waNumber ? `https://wa.me/${waNumber}?text=${waMessage}` : 'https://wa.me/918866039007',
  };
}
