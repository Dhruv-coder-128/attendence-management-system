/**
 * SMS — Student Management System
 * Licence service: fully offline. Keys are made on the developer's PC (npm run key -- <days> <Device ID>)
 * and checked here with the public key in licensePublicKey.js. No server is needed.
 */

import { Capacitor } from '@capacitor/core';
import { getHardwareFingerprint } from './hardwareFingerprint.js';
import { verifyLicense } from './offlineLicense.js';
import { LICENSE_PUBLIC_KEY } from './licensePublicKey.js';

const STORAGE_KEY = 'sms_school_license';
// Whole days left, never 0 while the key still works (0 only once it has expired).
const daysLeft = (endsAt) => { const ms = Date.parse(endsAt) - Date.now(); return ms > 0 ? Math.max(1, Math.floor(ms / 86400000)) : 0; };
export const DEFAULT_DEV_CONTACT = {
  name: 'Dhruv Shah',
  email: 'dushah2007@gmail.com',
  phone: '+91 8866039007',
  whatsapp: '+91 8866039007',
};

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
 * Server URL for the optional online parent portal (not used for licensing).
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
      parsed.daysRemaining = daysLeft(parsed.trialEndsAt);
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

const REASON_TEXT = {
  invalid: 'This licence key is not valid. Please copy the whole key exactly as you received it.',
  wrong_device: 'This licence key was made for a different computer. Send the Device ID shown below to the developer to get a key for this computer.',
  expired: 'Your licence period has ended. Contact the developer for a new key.',
  clock: 'The computer date is wrong (set before the licence was issued). Correct the date and time, then try again.',
};
const REASON_STATUS = { invalid: 'invalid', wrong_device: 'hardware_mismatch', expired: 'trial_expired', clock: 'clock_tampered' };

/** Maps a verified key to the shape cached in localStorage and read by the rest of the app. */
function toStored(key, lic, hwid) {
  const daysRemaining = lic.expiresAt ? daysLeft(lic.expiresAt) : 9999;
  return {
    licenseKey: key.trim(),
    licenseId: lic.keyId,
    schoolName: lic.schoolName,
    status: lic.type === 'paid' ? 'licensed' : 'trial_active',
    daysRemaining,
    maxStudents: lic.maxStudents,
    tier: getStudentCapacityTier(lic.maxStudents),
    isTimerVisible: lic.type !== 'paid',
    trialStartedAt: lic.issuedAt,
    trialEndsAt: lic.expiresAt,
    boundDeviceId: hwid,
    developerContact: DEFAULT_DEV_CONTACT,
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

// Highest date this installation has ever seen. If the PC clock is later wound back below it, that is tampering.
const LAST_SEEN_KEY = 'sms_license_last_seen';
function clockWasWoundBack(now) {
  try {
    const last = Number(localStorage.getItem(LAST_SEEN_KEY) || 0);
    if (now < last - 6 * 3600000) return true;
    if (now > last) localStorage.setItem(LAST_SEEN_KEY, String(now));
  } catch {}
  return false;
}

/** Checks a pasted key on this computer (offline) and saves it when valid. */
/** `publicKey` is only overridden by tests. */
export async function activateSchoolLicense(licenseKey, publicKey = LICENSE_PUBLIC_KEY) {
  if (!String(licenseKey || '').trim()) return { ok: false, error: 'Please paste your licence key.' };
  if (!publicKey) return { ok: false, error: 'This build has no licence public key. Run "npm run key" once, then rebuild the app.' };

  const hwid = await getHardwareFingerprint();
  const res = await verifyLicense(licenseKey, hwid, publicKey);
  if (!res.ok) return { ok: false, status: REASON_STATUS[res.reason], error: REASON_TEXT[res.reason] };

  const stored = toStored(licenseKey, res.license, hwid);
  saveStoredLicense(stored);
  // A fresh key from the developer also clears a past "clock wound back" lock (e.g. the PC date was once wrong).
  try { localStorage.setItem(LAST_SEEN_KEY, String(Date.now())); } catch {}
  syncSchoolNameToSettings(stored.schoolName);
  return { ok: true, data: stored };
}

/**
 * Connects this installation to the school's own Supabase project.
 * The licence key is still checked first; only the database settings are added.
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

/**
 * Re-checks the saved key at every start, fully offline: signature, this computer, expiry, clock.
 */
export async function validateLicense(options = {}) {
  const cached = getStoredLicense();

  // Teacher phones only take roll call over the school Wi-Fi; they never need a licence.
  if (Capacitor.isNativePlatform()) {
    return { ok: true, status: 'teacher_mobile_mode', daysRemaining: 9999, isTrialExpired: false, isLocked: false, developerContact: DEFAULT_DEV_CONTACT };
  }

  if (!cached?.licenseKey) {
    if (!isTauriDesktop() && !options.requireLicense) {
      return { ok: true, status: 'web_env_mode', daysRemaining: 9999, isTrialExpired: false, developerContact: DEFAULT_DEV_CONTACT };
    }
    return {
      ok: false, status: 'unlicensed', isTrialExpired: false, isLocked: true,
      error: 'No licence found. Please enter the licence key you received from the developer.',
      developerContact: DEFAULT_DEV_CONTACT,
    };
  }

  const now = Date.now();
  const lock = (status, error) => {
    saveStoredLicense({ ...cached, status, daysRemaining: 0, isLocked: true });
    return { ok: false, status, isTrialExpired: true, isLocked: true, error, developerContact: DEFAULT_DEV_CONTACT, trialEndsAt: cached.trialEndsAt };
  };
  if (clockWasWoundBack(now)) return lock('clock_tampered', REASON_TEXT.clock);

  const hwid = await getHardwareFingerprint();
  const res = await verifyLicense(cached.licenseKey, hwid, options.publicKey || LICENSE_PUBLIC_KEY, now);
  if (!res.ok) return lock(REASON_STATUS[res.reason], REASON_TEXT[res.reason]);

  const stored = toStored(cached.licenseKey, res.license, hwid);
  saveStoredLicense({ ...cached, ...stored });
  return {
    ok: true, status: stored.status, schoolName: stored.schoolName, daysRemaining: stored.daysRemaining,
    maxStudents: stored.maxStudents, tier: stored.tier, isTimerVisible: stored.isTimerVisible,
    isTrialExpired: false, isLocked: false, trialEndsAt: stored.trialEndsAt, developerContact: DEFAULT_DEV_CONTACT,
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
