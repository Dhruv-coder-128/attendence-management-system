/**
 * SMS — Student Management System
 * Client-Side License & 30-Day Trial Service
 * 
 * Enforces server-controlled 30-day trial lifecycle, anti-clock-tampering protection,
 * multi-school database mapping, and configurable developer contact actions.
 */

const STORAGE_KEY = 'sms_school_license';
const DEFAULT_DEV_CONTACT = {
  name: 'Dhruv Shah',
  email: 'dushah2007@gmail.com',
  phone: '+91 98765 43210',
  whatsapp: '+91 98765 43210',
};

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
 * Production HTTPS server URL for desktop app to reach serverless licensing APIs
 */
export function getApiBaseUrl() {
  if (typeof window === 'undefined') return '';
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRODUCTION_API_URL) || '';
  if (envUrl) return envUrl.replace(/\/+$/, '');

  // If in desktop app, connect to deployed production Vercel HTTPS domain
  if (isTauriDesktop()) {
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
    const merged = {
      ...existing,
      ...data,
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
 * Activates a school license with the server and initializes the 30-day trial
 */
export async function activateSchoolLicense(licenseKey) {
  if (!licenseKey || !licenseKey.trim()) {
    return { ok: false, error: 'License key is required.' };
  }

  const cleanKey = licenseKey.trim().toUpperCase();
  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/api/license-activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: cleanKey,
        deviceId: isTauriDesktop() ? 'windows-desktop-app' : 'web-browser',
      }),
    });

    const data = await res.json();

    if (data.ok) {
      saveStoredLicense({
        licenseKey: cleanKey,
        licenseId: data.licenseId,
        schoolName: data.schoolName,
        status: data.status,
        trialStartedAt: data.trialStartedAt,
        trialEndsAt: data.trialEndsAt,
        daysRemaining: data.daysRemaining,
        databaseConfig: data.databaseConfig,
        developerContact: data.developerContact || DEFAULT_DEV_CONTACT,
        lastServerSync: data.serverTime || new Date().toISOString(),
      });
      return { ok: true, data };
    }

    return {
      ok: false,
      status: data.status || 'error',
      error: data.error || 'Failed to activate license.',
      developerContact: data.developerContact || DEFAULT_DEV_CONTACT,
    };
  } catch (err) {
    console.error('Activation network error:', err);
    return {
      ok: false,
      error: `Network error: Unable to connect to licensing server (${err.message}). Please ensure internet access is available.`,
      developerContact: DEFAULT_DEV_CONTACT,
    };
  }
}

/**
 * Validates the school license with the server.
 * Enforces server-authoritative timestamps and detects system clock manipulation.
 */
export async function validateLicense(options = {}) {
  const cached = getStoredLicense();
  const baseUrl = getApiBaseUrl();

  // If running in web mode and no explicit school license configured,
  // allow standard single-tenant fallback to environment variables
  if (!isTauriDesktop() && !cached) {
    return {
      ok: true,
      status: 'web_env_mode',
      daysRemaining: 9999,
      isTrialExpired: false,
      developerContact: DEFAULT_DEV_CONTACT,
    };
  }

  if (!cached || !cached.licenseKey) {
    return {
      ok: false,
      status: 'unlicensed',
      isTrialExpired: false,
      error: 'No active school license found. Please enter your school license key to activate.',
      developerContact: DEFAULT_DEV_CONTACT,
    };
  }

  // Attempt server-side authoritative check
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
      });

      return {
        ok: true,
        status: data.status,
        schoolName: data.schoolName,
        daysRemaining: data.daysRemaining,
        isTrialExpired: false,
        trialEndsAt: data.trialEndsAt,
        developerContact: data.developerContact || DEFAULT_DEV_CONTACT,
      };
    }

    if (data.status === 'trial_expired') {
      saveStoredLicense({
        ...cached,
        status: 'trial_expired',
        daysRemaining: 0,
      });

      return {
        ok: false,
        status: 'trial_expired',
        isTrialExpired: true,
        error: 'Your 30-day trial has expired. Contact the developer to activate SMS.',
        developerContact: data.developerContact || cached.developerContact || DEFAULT_DEV_CONTACT,
        trialEndsAt: data.trialEndsAt,
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

    // Secure Offline Lease Evaluation
    // Rule: Do not trust computer clock or local storage as authority.
    // Allow operation ONLY if the last authoritative server sync was within the grace period (24 hours).
    const lastSyncMs = cached.lastServerSync ? new Date(cached.lastServerSync).getTime() : 0;
    const nowMs = Date.now();
    const graceMs = (cached.gracePeriodHours || 24) * 60 * 60 * 1000;

    // Clock Tampering Check:
    // If local system clock was set backwards before the last sync time:
    if (nowMs < lastSyncMs - 60000) {
      return {
        ok: false,
        status: 'clock_tampered',
        isTrialExpired: true,
        error: 'System clock discrepancy detected. Please connect to the internet to verify your SMS license.',
        developerContact: cached.developerContact || DEFAULT_DEV_CONTACT,
      };
    }

    // Offline Grace Check:
    if (nowMs - lastSyncMs > graceMs) {
      return {
        ok: false,
        status: 'offline_expired',
        isTrialExpired: false,
        error: 'Network connection required: SMS was offline for over 24 hours. Please reconnect to the internet to verify your trial.',
        developerContact: cached.developerContact || DEFAULT_DEV_CONTACT,
      };
    }

    // Check if trial was already expired prior to offline
    if (cached.status === 'trial_expired') {
      return {
        ok: false,
        status: 'trial_expired',
        isTrialExpired: true,
        error: 'Your 30-day trial has expired. Contact the developer to activate SMS.',
        developerContact: cached.developerContact || DEFAULT_DEV_CONTACT,
      };
    }

    // Valid offline grace lease
    return {
      ok: true,
      status: cached.status,
      schoolName: cached.schoolName,
      daysRemaining: cached.daysRemaining,
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
  const cleanPhone = (contact.phone || contact.whatsapp || '').replace(/[^0-9+]/g, '');
  const cleanEmail = contact.email || 'dushah2007@gmail.com';
  const waNumber = (contact.whatsapp || contact.phone || '').replace(/[^0-9]/g, '');

  const waMessage = encodeURIComponent(
    `Hello ${contact.name || 'Developer'}, I am using SMS — Student Management System. My school trial has completed and we would like to activate our full subscription.`
  );

  return {
    name: contact.name || 'Developer',
    email: cleanEmail,
    emailLink: `mailto:${cleanEmail}?subject=${encodeURIComponent('SMS — School License Activation Request')}`,
    phone: contact.phone || '',
    phoneLink: cleanPhone ? `tel:${cleanPhone}` : '',
    whatsappLink: waNumber ? `https://wa.me/${waNumber}?text=${waMessage}` : '',
  };
}
