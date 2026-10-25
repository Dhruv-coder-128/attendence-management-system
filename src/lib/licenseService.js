/**
 * SMS — Student Management System
 * Client-Side License & 30-Day Trial Service
 * 
 * Enforces server-controlled 30-day trial lifecycle, anti-clock-tampering protection,
 * multi-school database mapping, and configurable developer contact actions.
 */

import { supabase, isSupabaseConfigured } from './supabase.js';
import { Capacitor } from '@capacitor/core';
import { getHardwareFingerprint } from './hardwareFingerprint.js';

const STORAGE_KEY = 'sms_school_license';
const DEFAULT_DEV_CONTACT = {
  name: 'Dhruv Shah',
  email: 'dushah2007@gmail.com',
  phone: '+91 8866039007',
  whatsapp: '+91 8866039007',
};

export const SYSTEM_VERIFIER_EMAIL = 'client-license-sync@sms-system.internal';
export const SYSTEM_VERIFIER_PASS = 'SmsLicenseSync2026!SecureKey';

/**
 * Ensures a valid Supabase authenticated session exists for querying license state.
 * Specifically checks that the active user is the authorized verifier or developer.
 */
export async function ensureLicensingAuth(client) {
  if (!client || !client.auth) return false;
  try {
    const { data: sess } = await client.auth.getSession();
    const userEmail = (sess?.session?.user?.email || '').toLowerCase();
    if (userEmail === SYSTEM_VERIFIER_EMAIL.toLowerCase() || userEmail === 'dushah2007@gmail.com') {
      return true;
    }
    const { error } = await client.auth.signInWithPassword({
      email: SYSTEM_VERIFIER_EMAIL,
      password: SYSTEM_VERIFIER_PASS,
    });
    if (error) {
      console.warn('Licensing auth signIn error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Licensing auth exception:', err);
    return false;
  }
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

/**
 * Production HTTPS server URL for desktop app and Android app to reach serverless licensing APIs
 */
export function getApiBaseUrl() {
  if (typeof window === 'undefined') return '';
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRODUCTION_API_URL) || '';
  if (envUrl) return envUrl.replace(/\/+$/, '');

  // If in desktop app or native mobile APK, connect to deployed production Vercel HTTPS domain
  if (isTauriDesktop() || Capacitor.isNativePlatform()) {
    return 'https://attendance-management-system-lovat.vercel.app';
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
    return JSON.parse(raw);
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
 * -------------------------------------------------------------
 * Authoritative SaaS Cloud License Management (Supabase Direct)
 * Used by MasterAdminPortalPage for zero-latency, 100% reliable cloud sync
 * -------------------------------------------------------------
 */

export async function fetchCloudLicenses() {
  if (!supabase || !isSupabaseConfigured) return [];
  try {
    await ensureLicensingAuth(supabase);
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .like('code', 'LIC:%')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((row, idx) => {
      let parsed = {};
      try { parsed = JSON.parse(row.description) || {}; } catch {}
      const cleanKey = parsed.license_key || parsed.licenseKey || row.code.replace(/^LIC:/, '');
      const schoolName = parsed.school_name || parsed.schoolName || row.name?.replace(/\s*\[.*\]/, '').trim() || 'SMS Client School';
      const isLocked = Boolean(parsed.is_locked || parsed.isLocked || !row.is_active || parsed.status === 'suspended');
      const daysRemaining = parsed.days_remaining !== undefined ? parsed.days_remaining : (parsed.daysRemaining !== undefined ? parsed.daysRemaining : 30);
      const isTimerVisible = parsed.is_timer_visible !== undefined ? parsed.is_timer_visible : (parsed.isTimerVisible !== false);

      return {
        id: parsed.id || row.id || `SMS-SCH-${String(idx + 1).padStart(3, '0')}`,
        schoolName,
        contactPerson: parsed.contact_person || parsed.contactPerson || 'Principal / Administrator',
        email: parsed.email || '',
        phone: parsed.phone || '',
        licenseKey: cleanKey,
        status: isLocked ? 'suspended' : (parsed.status || 'trial_active'),
        isLocked,
        isTimerVisible,
        daysRemaining,
        trialStartedAt: parsed.trial_started_at || parsed.trialStartedAt || row.created_at,
        trialEndsAt: parsed.trial_ends_at || parsed.trialEndsAt,
        boundDeviceId: parsed.bound_device_id || parsed.activated_device_id || null,
        notes: parsed.notes || '',
        createdAt: row.created_at,
      };
    });
  } catch (err) {
    console.warn('fetchCloudLicenses error:', err);
    return [];
  }
}

export async function saveCloudLicense(clientObj) {
  if (!supabase || !isSupabaseConfigured || !clientObj?.licenseKey) return { ok: false, error: 'Database unconfigured' };
  try {
    await ensureLicensingAuth(supabase);
    const cleanKey = String(clientObj.licenseKey).trim().toUpperCase();
    const isLocked = Boolean(clientObj.isLocked || clientObj.status === 'suspended');
    const status = isLocked ? 'suspended' : (clientObj.status || (clientObj.daysRemaining > 0 ? 'trial_active' : 'trial_expired'));
    const schoolName = clientObj.schoolName?.trim() || 'SMS Client School';

    const payload = {
      id: clientObj.id || `LIC-${cleanKey}`,
      license_key: cleanKey,
      licenseKey: cleanKey,
      school_name: schoolName,
      schoolName: schoolName,
      contact_person: clientObj.contactPerson || 'Principal / Administrator',
      email: clientObj.email || '',
      phone: clientObj.phone || '',
      status,
      is_locked: isLocked,
      isLocked: isLocked,
      days_remaining: clientObj.daysRemaining !== undefined ? clientObj.daysRemaining : 30,
      daysRemaining: clientObj.daysRemaining !== undefined ? clientObj.daysRemaining : 30,
      trial_started_at: clientObj.trialStartedAt || new Date().toISOString(),
      trial_ends_at: clientObj.trialEndsAt || new Date(Date.now() + (clientObj.daysRemaining || 30) * 86400000).toISOString(),
      is_timer_visible: clientObj.isTimerVisible !== false,
      bound_device_id: clientObj.boundDeviceId || null,
      notes: clientObj.notes || '',
      updated_at: new Date().toISOString(),
    };

    const courseName = `${schoolName} [${status.toUpperCase()}]`;

    const { error } = await supabase.from('courses').upsert({
      code: 'LIC:' + cleanKey,
      name: courseName,
      level: 'License',
      description: JSON.stringify(payload),
      is_active: !isLocked,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'code' });

    if (error) throw error;
    return { ok: true, data: payload };
  } catch (err) {
    console.error('saveCloudLicense error:', err);
    return { ok: false, error: err.message };
  }
}

export async function adjustCloudLicenseDays(licenseKey, deltaOrExactDays, isExact = false) {
  if (!supabase || !isSupabaseConfigured || !licenseKey) return { ok: false };
  try {
    await ensureLicensingAuth(supabase);
    const cleanKey = String(licenseKey).trim().toUpperCase();
    const { data: row } = await supabase.from('courses').select('*').eq('code', 'LIC:' + cleanKey).maybeSingle();
    if (!row) return { ok: false, error: 'License not found in cloud' };

    let desc = {};
    try { desc = JSON.parse(row.description) || {}; } catch {}

    const curDays = parseInt(desc.days_remaining ?? desc.daysRemaining ?? 30, 10);
    const newDays = isExact
      ? Math.max(0, parseInt(deltaOrExactDays, 10))
      : (deltaOrExactDays === 9999 ? 9999 : Math.max(0, curDays + parseInt(deltaOrExactDays, 10)));

    const now = new Date();
    const newEndsAt = new Date(now.getTime() + newDays * 86400000).toISOString();
    const computedStatus = newDays >= 9000 ? 'licensed' : (newDays > 0 ? 'trial_active' : 'trial_expired');
    const isLocked = newDays <= 0 && computedStatus !== 'licensed';

    desc.days_remaining = newDays;
    desc.daysRemaining = newDays;
    desc.trial_ends_at = newEndsAt;
    desc.status = isLocked ? 'suspended' : computedStatus;
    desc.is_locked = isLocked;
    desc.isLocked = isLocked;
    desc.updated_at = now.toISOString();

    const courseName = `${desc.school_name || 'SMS Client School'} [${desc.status.toUpperCase()}]`;

    await supabase.from('courses').update({
      name: courseName,
      description: JSON.stringify(desc),
      is_active: !isLocked,
      updated_at: now.toISOString(),
    }).eq('code', 'LIC:' + cleanKey);

    return { ok: true, daysRemaining: newDays, status: desc.status, trialEndsAt: newEndsAt };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function setCloudLicenseLock(licenseKey, willLock) {
  if (!supabase || !isSupabaseConfigured || !licenseKey) return { ok: false };
  try {
    await ensureLicensingAuth(supabase);
    const cleanKey = String(licenseKey).trim().toUpperCase();
    const { data: row } = await supabase.from('courses').select('*').eq('code', 'LIC:' + cleanKey).maybeSingle();
    if (!row) return { ok: false, error: 'License not found in cloud' };

    let desc = {};
    try { desc = JSON.parse(row.description) || {}; } catch {}

    const days = parseInt(desc.days_remaining ?? desc.daysRemaining ?? 30, 10);
    const newStatus = willLock ? 'suspended' : (days > 0 ? 'trial_active' : 'trial_expired');

    desc.is_locked = Boolean(willLock);
    desc.isLocked = Boolean(willLock);
    desc.status = newStatus;
    desc.updated_at = new Date().toISOString();

    const courseName = `${desc.school_name || 'SMS Client School'} [${newStatus.toUpperCase()}]`;

    await supabase.from('courses').update({
      name: courseName,
      description: JSON.stringify(desc),
      is_active: !willLock,
      updated_at: new Date().toISOString(),
    }).eq('code', 'LIC:' + cleanKey);

    return { ok: true, isLocked: Boolean(willLock), status: newStatus };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function unbindCloudHardware(licenseKey) {
  if (!supabase || !isSupabaseConfigured || !licenseKey) return { ok: false };
  try {
    await ensureLicensingAuth(supabase);
    const cleanKey = String(licenseKey).trim().toUpperCase();
    const { data: row } = await supabase.from('courses').select('*').eq('code', 'LIC:' + cleanKey).maybeSingle();
    if (!row) return { ok: false, error: 'License not found' };

    let desc = {};
    try { desc = JSON.parse(row.description) || {}; } catch {}

    desc.bound_device_id = null;
    desc.activated_device_id = null;
    desc.is_activated = false;
    desc.bound_at = null;
    desc.updated_at = new Date().toISOString();

    await supabase.from('courses').update({
      description: JSON.stringify(desc),
      updated_at: new Date().toISOString(),
    }).eq('code', 'LIC:' + cleanKey);

    return { ok: true, message: 'Workstation binding cleared. School can now activate on a new computer.' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function deleteCloudLicense(licenseKey) {
  if (!supabase || !isSupabaseConfigured || !licenseKey) return { ok: false };
  try {
    await ensureLicensingAuth(supabase);
    const cleanKey = String(licenseKey).trim().toUpperCase();
    await supabase.from('courses').delete().eq('code', 'LIC:' + cleanKey);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Activates a school license with the server and initializes the trial/subscription.
 * Enforces Single-Device Hardware Binding: Once activated, key is permanently bound to the physical machine ID.
 */
export async function activateSchoolLicense(licenseKey) {
  if (!licenseKey || !licenseKey.trim()) {
    return { ok: false, error: 'License key is required.' };
  }

  const cleanKey = licenseKey.trim().toUpperCase();
  const hwid = await getHardwareFingerprint();
  const baseUrl = getApiBaseUrl();

  // 1. Direct authoritative check & binding via Supabase database
  if (supabase && isSupabaseConfigured) {
    try {
      await ensureLicensingAuth(supabase);
      const licCode = 'LIC:' + cleanKey;
      const { data: licRow } = await supabase
        .from('courses')
        .select('*')
        .eq('code', licCode)
        .maybeSingle();

      if (licRow) {
        let licInfo = {};
        try { licInfo = JSON.parse(licRow.description) || {}; } catch {}

        // Check if suspended
        const isSuspended = licInfo.is_locked || licInfo.status === 'suspended' || !licRow.is_active;
        if (isSuspended) {
          return {
            ok: false,
            error: 'This school license has been locked / suspended by the developer. Please contact Dhruv Shah (+91 8866039007).',
          };
        }

        // Single-Device Hardware Binding Check
        const boundId = licInfo.bound_device_id || licInfo.activated_device_id;
        if (boundId && boundId !== hwid) {
          return {
            ok: false,
            error: `Single-Device License Policy: This license key is already permanently bound to another workstation (${boundId}). It cannot be activated on this computer. Contact Dhruv Shah (+91 8866039007) for workstation authorization or license reset.`,
          };
        }

        // First-time activation: bind this workstation ID to cloud
        if (!boundId) {
          licInfo.bound_device_id = hwid;
          licInfo.activated_device_id = hwid;
          licInfo.bound_at = new Date().toISOString();
          licInfo.is_activated = true;

          try {
            await supabase.from('courses').update({
              description: JSON.stringify(licInfo),
              updated_at: new Date().toISOString(),
            }).eq('code', licCode);
          } catch (updateErr) {
            console.warn('Could not persist cloud device binding:', updateErr);
          }
        }

        const schoolName = licInfo.school_name || licInfo.schoolName || licRow.name?.replace(/\s*\[.*\]/, '').trim() || 'SMS Academy';
        const daysRemaining = licInfo.days_remaining !== undefined ? licInfo.days_remaining : 30;
        const status = licInfo.status || 'trial_active';

        const activeLicenseData = {
          licenseKey: cleanKey,
          licenseId: `LIC-${cleanKey}`,
          schoolName,
          status,
          daysRemaining,
          boundDeviceId: hwid,
          trialStartedAt: licInfo.trial_started_at || new Date().toISOString(),
          trialEndsAt: licInfo.trial_ends_at,
          isTimerVisible: licInfo.is_timer_visible !== false,
          developerContact: DEFAULT_DEV_CONTACT,
          lastServerSync: new Date().toISOString(),
        };

        saveStoredLicense(activeLicenseData);
        return { ok: true, data: activeLicenseData };
      }
    } catch (dbErr) {
      console.warn('Direct Supabase activation query error:', dbErr);
    }
  }

  // 2. Try server-side validation via /api/license-activate (if deployed)
  let serverData = null;
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/api/license-activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: cleanKey,
          deviceId: hwid,
        }),
      });
      if (res.ok) {
        serverData = await res.json();
      }
    } catch {
      serverData = null;
    }
  }

  if (serverData && serverData.ok) {
    saveStoredLicense({
      licenseKey: cleanKey,
      licenseId: serverData.licenseId,
      schoolName: serverData.schoolName,
      status: serverData.status,
      trialStartedAt: serverData.trialStartedAt,
      trialEndsAt: serverData.trialEndsAt,
      daysRemaining: serverData.daysRemaining,
      boundDeviceId: hwid,
      databaseConfig: serverData.databaseConfig,
      developerContact: serverData.developerContact || DEFAULT_DEV_CONTACT,
      lastServerSync: serverData.serverTime || new Date().toISOString(),
    });
    return { ok: true, data: serverData };
  }

  // 3. Master Developer Emergency Override Key Only
  const isMasterDevKey = cleanKey === 'SMS-MASTER-DEV-2026' || cleanKey === 'SMS-DEVELOPER-8866';
  if (isMasterDevKey) {
    const masterData = {
      licenseKey: cleanKey,
      licenseId: `LIC-${cleanKey}`,
      schoolName: 'SMS Developer Master Console',
      status: 'licensed',
      trialStartedAt: new Date().toISOString(),
      trialEndsAt: new Date(Date.now() + 3650 * 86400000).toISOString(),
      daysRemaining: 9999,
      boundDeviceId: hwid,
      developerContact: DEFAULT_DEV_CONTACT,
      lastServerSync: new Date().toISOString(),
    };
    saveStoredLicense(masterData);
    return { ok: true, data: masterData };
  }

  // Key was neither found in the cloud nor a recognized master key
  return {
    ok: false,
    error: 'Invalid license key. This key was not found in the SMS central registry. Please contact Dhruv Shah (+91 8866039007) to obtain a valid license key.',
  };
}

/**
 * Configures an explicit dedicated Supabase database for a specific school/client (BYODB)
 */
export function configureCustomSchoolDatabase({ schoolName, supabaseUrl, supabaseAnonKey, licenseKey }) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: 'Database URL and Publishable Anon Key are required.' };
  }
  const cleanUrl = supabaseUrl.trim().replace(/\/+$/, '');
  const cleanKey = supabaseAnonKey.trim();
  const name = schoolName?.trim() || 'Dedicated School Database';
  const cleanLicKey = licenseKey?.trim() || `SMS-${name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)}-2026`;

  const now = new Date();
  const data = {
    licenseKey: cleanLicKey,
    licenseId: `LIC-${cleanLicKey}`,
    schoolName: name,
    status: 'licensed',
    daysRemaining: 9999,
    trialStartedAt: now.toISOString(),
    trialEndsAt: new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000).toISOString(),
    databaseConfig: {
      supabaseUrl: cleanUrl,
      supabaseAnonKey: cleanKey,
    },
    isCustomSchoolDb: true,
    developerContact: DEFAULT_DEV_CONTACT,
    lastServerSync: now.toISOString(),
  };

  saveStoredLicense(data);
  return { ok: true, data };
}

/**
 * Validates the school license with the server.
 * Enforces server-authoritative timestamps, hardware device binding, and anti-cloning locks.
 */
export async function validateLicense(options = {}) {
  const cached = getStoredLicense();
  const baseUrl = getApiBaseUrl();

  // If running in desktop EXE or native mobile APK, license is strictly MANDATORY
  const isEnforcedAppEnvironment = isTauriDesktop() || Capacitor.isNativePlatform();

  if (!cached || !cached.licenseKey) {
    if (!isEnforcedAppEnvironment && !options.requireLicense) {
      return {
        ok: true,
        status: 'web_env_mode',
        daysRemaining: 9999,
        isTrialExpired: false,
        developerContact: DEFAULT_DEV_CONTACT,
      };
    }

    return {
      ok: false,
      status: 'unlicensed',
      isTrialExpired: false,
      isLocked: true,
      error: 'No active school license found. Please enter your School License Key to activate.',
      developerContact: DEFAULT_DEV_CONTACT,
    };
  }

  const currentHwid = await getHardwareFingerprint();

  // 0. Anti-Cloning / Anti-Copy Hardware Mismatch Check (Local Storage Protection)
  // If the app folder or storage was copied from PC 1 to PC 2:
  if (cached.boundDeviceId && currentHwid && cached.boundDeviceId !== currentHwid) {
    return {
      ok: false,
      status: 'cloned_copy_detected',
      isTrialExpired: true,
      isLocked: true,
      error: `SECURITY LOCKOUT: Cloned or copied software installation detected! This software was copied from another computer. The license is strictly tied to the original authorized workstation (${cached.boundDeviceId}). Contact Dhruv Shah (+91 8866039007) to authorize this computer.`,
      developerContact: DEFAULT_DEV_CONTACT,
      currentHwid,
      boundDeviceId: cached.boundDeviceId,
    };
  }

  // 1. Direct authoritative check via Supabase database (Real-Time Cloud & Desktop Enforcement)
  if (supabase && isSupabaseConfigured) {
    try {
      await ensureLicensingAuth(supabase);
      const licCode = 'LIC:' + cached.licenseKey;
      const { data: licRow } = await supabase
        .from('courses')
        .select('*')
        .eq('code', licCode)
        .maybeSingle();

      if (licRow) {
        let licInfo = null;
        try {
          licInfo = JSON.parse(licRow.description);
        } catch {
          licInfo = { status: licRow.is_active ? 'licensed' : 'suspended' };
        }

        // Anti-Cloning Cloud Check: If cloud has a bound device that differs from this machine
        const cloudBoundId = licInfo?.bound_device_id || licInfo?.activated_device_id;
        if (cloudBoundId && currentHwid && cloudBoundId !== currentHwid) {
          saveStoredLicense({
            ...cached,
            status: 'hardware_mismatch',
            isLocked: true,
            daysRemaining: 0,
          });
          return {
            ok: false,
            status: 'hardware_mismatch',
            isTrialExpired: true,
            isLocked: true,
            error: `SECURITY LOCKOUT: Workstation mismatch. This license is bound to another computer in the cloud database (${cloudBoundId}). Contact Dhruv Shah (+91 8866039007).`,
            developerContact: DEFAULT_DEV_CONTACT,
            currentHwid,
            cloudBoundId,
          };
        }

        // Auto-bind unanchored legacy licenses to current hardware ID
        if (!cloudBoundId && currentHwid) {
          licInfo.bound_device_id = currentHwid;
          licInfo.activated_device_id = currentHwid;
          licInfo.bound_at = new Date().toISOString();
          supabase.from('courses').update({
            description: JSON.stringify(licInfo),
            updated_at: new Date().toISOString(),
          }).eq('code', licCode).then(() => {}).catch(() => {});
        }

        const effectiveStatus = licInfo?.status || (licRow.is_active ? 'licensed' : 'suspended');
        const isSuspended =
          effectiveStatus === 'suspended' ||
          effectiveStatus === 'revoked' ||
          effectiveStatus === 'locked' ||
          licInfo?.is_locked === true ||
          licInfo?.isLocked === true ||
          licRow.is_active === false;

        if (isSuspended) {
          saveStoredLicense({
            ...cached,
            status: 'suspended',
            daysRemaining: 0,
            isLocked: true,
          });
          return {
            ok: false,
            status: 'suspended',
            isTrialExpired: true,
            isLocked: true,
            error: 'This school installation has been locked / suspended by the administrator or developer. Please contact Dhruv Shah (+91 8866039007).',
            developerContact: DEFAULT_DEV_CONTACT,
          };
        }

        // Active license updates from cloud (real-time remote lock/unlock and timer visibility)
        const isTimerVisible = licInfo?.is_timer_visible !== undefined
          ? Boolean(licInfo.is_timer_visible)
          : (effectiveStatus === 'trial_active');

        const daysRem = licInfo?.days_remaining ?? licInfo?.daysRemaining ?? cached.daysRemaining ?? 30;
        const trialEnds = licInfo?.trial_ends_at || licInfo?.trialEndsAt || cached.trialEndsAt;

        // Check if trial days ran out
        if (daysRem <= 0 && effectiveStatus !== 'licensed') {
          saveStoredLicense({
            ...cached,
            status: 'trial_expired',
            daysRemaining: 0,
            isLocked: true,
            isTimerVisible: false,
          });
          return {
            ok: false,
            status: 'trial_expired',
            isTrialExpired: true,
            isLocked: true,
            error: '30-Day Evaluation Period has ended. Please contact developer for a full commercial license.',
            developerContact: DEFAULT_DEV_CONTACT,
          };
        }

        saveStoredLicense({
          ...cached,
          status: effectiveStatus,
          isLocked: false,
          isTimerVisible,
          daysRemaining: daysRem,
          trialEndsAt: trialEnds,
          boundDeviceId: cloudBoundId || currentHwid || cached.boundDeviceId,
        });

        return {
          ok: true,
          status: effectiveStatus,
          schoolName: licInfo?.school_name || licInfo?.schoolName || licRow.name?.replace(/\s*\[.*\]/, '') || cached.schoolName,
          daysRemaining: daysRem,
          isTimerVisible,
          isTrialExpired: false,
          isLocked: false,
          trialEndsAt: trialEnds,
          developerContact: DEFAULT_DEV_CONTACT,
        };
      }
    } catch (dbErr) {
      console.warn('Direct Supabase license check warning:', dbErr);
    }
  }

  // 2. Attempt server-side authoritative check via serverless API
  try {
    const res = await fetch(`${baseUrl}/api/license-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: cached.licenseKey,
        licenseId: cached.licenseId,
      }),
    });

    const data = await res.json();

    if (data.ok) {
      const isTimerVisible = data.isTimerVisible !== undefined
        ? Boolean(data.isTimerVisible)
        : (data.status === 'trial_active');

      saveStoredLicense({
        ...cached,
        status: data.status,
        daysRemaining: data.daysRemaining,
        trialStartedAt: data.trialStartedAt || cached.trialStartedAt,
        trialEndsAt: data.trialEndsAt || cached.trialEndsAt,
        databaseConfig: data.databaseConfig || cached.databaseConfig,
        developerContact: data.developerContact || cached.developerContact || DEFAULT_DEV_CONTACT,
        lastServerSync: data.serverTime || new Date().toISOString(),
        gracePeriodHours: data.gracePeriodHours || 24,
        isTimerVisible,
        isLocked: false,
      });

      return {
        ok: true,
        status: data.status,
        schoolName: data.schoolName,
        daysRemaining: data.daysRemaining,
        isTimerVisible,
        isTrialExpired: false,
        isLocked: false,
        trialEndsAt: data.trialEndsAt,
        developerContact: data.developerContact || DEFAULT_DEV_CONTACT,
      };
    }

    if (data.status === 'trial_expired') {
      saveStoredLicense({
        ...cached,
        status: 'trial_expired',
        daysRemaining: 0,
        isLocked: true,
      });

      return {
        ok: false,
        status: 'trial_expired',
        isTrialExpired: true,
        isLocked: true,
        error: 'Your trial period has expired. Contact the developer to activate SMS.',
        developerContact: data.developerContact || cached.developerContact || DEFAULT_DEV_CONTACT,
        trialEndsAt: data.trialEndsAt,
      };
    }

    if (data.status === 'suspended' || data.status === 'revoked' || data.status === 'locked') {
      saveStoredLicense({
        ...cached,
        status: data.status,
        daysRemaining: 0,
        isLocked: true,
      });

      return {
        ok: false,
        status: data.status,
        isTrialExpired: true,
        isLocked: true,
        error: data.error || 'This school installation has been suspended by the developer/administrator. Contact developer to resolve.',
        developerContact: data.developerContact || cached.developerContact || DEFAULT_DEV_CONTACT,
      };
    }

    return {
      ok: false,
      status: data.status || 'invalid',
      isTrialExpired: false,
      error: data.error || 'License validation failed.',
      developerContact: data.developerContact || cached.developerContact || DEFAULT_DEV_CONTACT,
    };
  } catch (netErr) {
    console.warn('Licensing server unreachable, evaluating secure offline lease:', netErr.message);

    const currentHwid = await getHardwareFingerprint();

    // 0. Offline Anti-Cloning Check: Ensure offline workstation matches bound hardware
    if (cached.boundDeviceId && currentHwid && cached.boundDeviceId !== currentHwid) {
      return {
        ok: false,
        status: 'cloned_copy_detected',
        isTrialExpired: true,
        isLocked: true,
        error: `SECURITY LOCKOUT: Cloned copy detected! This offline software was copied from another computer. The license is bound to (${cached.boundDeviceId}). Contact Dhruv Shah (+91 8866039007).`,
        developerContact: cached.developerContact || DEFAULT_DEV_CONTACT,
      };
    }

    const nowMs = Date.now();

    // 1. If explicitly locked or suspended prior to offline
    if (cached.status === 'suspended' || cached.status === 'revoked' || cached.status === 'locked' || cached.isLocked) {
      return {
        ok: false,
        status: cached.status || 'suspended',
        isTrialExpired: true,
        isLocked: true,
        error: 'This school installation is suspended by the developer. Please contact Dhruv Shah.',
        developerContact: cached.developerContact || DEFAULT_DEV_CONTACT,
      };
    }

    // 2. Strict Timer Expiry Check against trialEndsAt (30-day, 15-day, or custom days)
    if (cached.trialEndsAt && cached.status !== 'licensed') {
      const trialEndsMs = new Date(cached.trialEndsAt).getTime();
      const diffMs = trialEndsMs - nowMs;
      const actualDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      if (trialEndsMs <= nowMs || actualDaysRemaining <= 0) {
        saveStoredLicense({
          ...cached,
          status: 'trial_expired',
          daysRemaining: 0,
          isLocked: true,
        });

        return {
          ok: false,
          status: 'trial_expired',
          isTrialExpired: true,
          isLocked: true,
          error: 'Your trial period has expired. Contact the developer to activate SMS.',
          developerContact: cached.developerContact || DEFAULT_DEV_CONTACT,
          trialEndsAt: cached.trialEndsAt,
        };
      }
    }

    // 3. Clock Tampering Check:
    // If local system clock was set backwards before the last sync time:
    const lastSyncMs = cached.lastServerSync ? new Date(cached.lastServerSync).getTime() : 0;
    if (nowMs < lastSyncMs - 60000) {
      return {
        ok: false,
        status: 'clock_tampered',
        isTrialExpired: true,
        isLocked: true,
        error: 'System clock discrepancy detected. Please connect to the internet to verify your SMS license.',
        developerContact: cached.developerContact || DEFAULT_DEV_CONTACT,
      };
    }

    const cleanKey = (cached.licenseKey || '').toUpperCase();
    const isPermanentOrOffline = cached.status === 'licensed' ||
      cached.isOfflineMode ||
      cached.daysRemaining > 365 ||
      cleanKey.includes('OFFLINE') ||
      cleanKey.includes('MASTER') ||
      cleanKey.includes('LIFETIME');

    if (isPermanentOrOffline) {
      return {
        ok: true,
        status: cached.status || 'licensed',
        schoolName: cached.schoolName,
        daysRemaining: cached.daysRemaining || 9999,
        isTrialExpired: false,
        isOfflineLease: true,
        developerContact: cached.developerContact || DEFAULT_DEV_CONTACT,
      };
    }

    // Compute live days remaining from trialEndsAt
    let currentDaysRemaining = cached.daysRemaining;
    if (cached.trialEndsAt) {
      const trialEndsMs = new Date(cached.trialEndsAt).getTime();
      currentDaysRemaining = Math.max(0, Math.ceil((trialEndsMs - nowMs) / (1000 * 60 * 60 * 24)));
    }

    // Standard trial: if trial period is still active
    if (currentDaysRemaining > 0 && cached.status !== 'trial_expired') {
      return {
        ok: true,
        status: cached.status || 'trial_active',
        schoolName: cached.schoolName,
        daysRemaining: currentDaysRemaining,
        isTrialExpired: false,
        isOfflineLease: true,
        developerContact: cached.developerContact || DEFAULT_DEV_CONTACT,
      };
    }

    // Check if trial was already expired prior to offline
    if (cached.status === 'trial_expired' || currentDaysRemaining <= 0) {
      return {
        ok: false,
        status: 'trial_expired',
        isTrialExpired: true,
        isLocked: true,
        error: 'Your trial period has expired. Contact the developer to activate SMS.',
        developerContact: cached.developerContact || DEFAULT_DEV_CONTACT,
      };
    }

    // Valid offline grace lease
    return {
      ok: true,
      status: cached.status,
      schoolName: cached.schoolName,
      daysRemaining: currentDaysRemaining,
      isTrialExpired: false,
      isOfflineLease: true,
      developerContact: cached.developerContact || DEFAULT_DEV_CONTACT,
    };
  }
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
