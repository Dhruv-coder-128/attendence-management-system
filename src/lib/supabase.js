import { createClient } from '@supabase/supabase-js';
import { getStoredLicense } from './licenseService.js';
import { createLocalTableQueryBuilder, getStorageMode } from './databaseAdapter.js';
import { hashPassword, verifyPassword } from './localPassword.js';

/**
 * Supabase Client Module
 * Supports single-tenant web mode, multi-tenant per-school desktop mode,
 * and reliable offline/production fallback credentials.
 * Safe for client-side execution (never uses service_role or secret keys).
 */

export const PRODUCTION_SUPABASE_URL = 'https://uugvudqbwoyywzbjrfol.supabase.co';
export const PRODUCTION_SUPABASE_ANON_KEY = 'sb_publishable_pd2n3DRFhFgn79-SW6FEPw_vqRz2Jut';

const envObj = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : (typeof process !== 'undefined' ? process.env : {});
const defaultEnvUrl = (envObj.VITE_SUPABASE_URL || envObj.SUPABASE_URL || PRODUCTION_SUPABASE_URL).trim();
const defaultEnvKey = (envObj.VITE_SUPABASE_PUBLISHABLE_KEY || envObj.VITE_SUPABASE_ANON_KEY || envObj.SUPABASE_ANON_KEY || PRODUCTION_SUPABASE_ANON_KEY).trim();

/**
 * Resolves the currently active database credentials:
 * 1. School-specific database credentials from the activated license (if present)
 * 2. Fallback to production environment variables (.env.local / Vercel envs)
 * 3. Fallback to dedicated production Supabase instance
 */
export function getActiveDatabaseConfig() {
  const license = getStoredLicense();
  const schoolDb = license?.databaseConfig;

  if (schoolDb?.supabaseUrl && schoolDb?.supabaseAnonKey) {
    return {
      url: schoolDb.supabaseUrl.trim(),
      key: schoolDb.supabaseAnonKey.trim(),
      schoolName: license.schoolName || 'School Instance',
      isCustomSchoolDb: true,
      configured: true,
    };
  }

  const isEnvValid = Boolean(
    defaultEnvUrl &&
    defaultEnvKey &&
    defaultEnvUrl !== 'https://your-project-ref.supabase.co' &&
    !defaultEnvUrl.includes('your-project') &&
    !defaultEnvKey.includes('your-anon-public-key') &&
    !defaultEnvKey.includes('your-supabase-publishable')
  );

  const finalUrl = (isEnvValid ? defaultEnvUrl : PRODUCTION_SUPABASE_URL).trim();
  const finalKey = (isEnvValid ? defaultEnvKey : PRODUCTION_SUPABASE_ANON_KEY).trim();

  return {
    url: finalUrl,
    key: finalKey,
    schoolName: 'Primary Institution',
    isCustomSchoolDb: false,
    configured: Boolean(finalUrl && finalKey),
  };
}

let activeClientInstance = null;
let activeClientUrl = null;
let activeClientKey = null;

/**
 * Obtains or instantiates the Supabase client for the current active database
 */
export function getSupabaseClient() {
  const config = getActiveDatabaseConfig();
  if (!config.configured || !config.url || !config.key) {
    return null;
  }

  if (activeClientInstance && activeClientUrl === config.url && activeClientKey === config.key) {
    return activeClientInstance;
  }

  activeClientUrl = config.url;
  activeClientKey = config.key;
  activeClientInstance = createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return activeClientInstance;
}

/**
 * Forces reinitialization of the Supabase client (e.g. after activating a new school license)
 */
export function reinitializeSupabaseClient() {
  activeClientInstance = null;
  activeClientUrl = null;
  activeClientKey = null;
  const client = getSupabaseClient();
  isSupabaseConfigured = Boolean(getActiveDatabaseConfig().configured);
  return client;
}

const OFFLINE_AUTH_STORAGE_KEY = 'sms_offline_auth_user';
const offlineAuthListeners = new Set();

export function getStoredAuthUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(OFFLINE_AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredAuthUser(user) {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      localStorage.setItem(OFFLINE_AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(OFFLINE_AUTH_STORAGE_KEY);
    }
  } catch {}
  offlineAuthListeners.forEach((fn) => {
    try {
      fn(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user, access_token: 'offline-token' } : null);
    } catch {}
  });
}

const OWNER_PERMISSIONS = {
  view_students: true, edit_students: true, delete_students: true,
  view_attendance: true, mark_attendance: true, manage_batches: true,
  manage_fees: true, manage_exams: true, manage_parents: true,
  send_notifications: true, export_data: true, manage_users: true,
  manage_settings: true,
};
const ADMIN_PERMISSIONS = { ...OWNER_PERMISSIONS, delete_students: false };
const MODERATOR_PERMISSIONS = { ...ADMIN_PERMISSIONS, manage_users: false };
export function defaultPermissionsForRole(role) {
  return role === 'owner' ? OWNER_PERMISSIONS : role === 'admin' ? ADMIN_PERMISSIONS : MODERATOR_PERMISSIONS;
}

// Auth follows the data store: offline mode → local IndexedDB accounts, cloud mode → Supabase Auth.
function isLocalAuthMode() {
  return getStorageMode() !== 'cloud' || !getSupabaseClient()?.auth;
}

async function listLocalProfiles() {
  const { data } = await createLocalTableQueryBuilder('user_profiles').select('*');
  return Array.isArray(data) ? data : [];
}

function toSessionUser(profile) {
  const role = profile.role || 'moderator';
  const permissions = profile.permissions && Object.keys(profile.permissions).length ? profile.permissions : defaultPermissionsForRole(role);
  return {
    id: profile.id,
    email: profile.email,
    role,
    aud: 'authenticated',
    user_metadata: { full_name: profile.full_name || 'Staff User', role },
    app_metadata: { role, permissions, provider: 'email' },
  };
}

function signedIn(user) {
  setStoredAuthUser(user);
  return { data: { user, session: { user, access_token: 'offline-token' } }, error: null };
}

const authError = (msg) => ({ data: { user: null, session: null }, error: new Error(msg) });

/** True when no local account has a password yet (fresh or pre-1.0.13 install): first sign-up becomes owner. */
export async function needsLocalOwnerSetup() {
  if (!isLocalAuthMode()) return false;
  return !(await listLocalProfiles()).some((p) => p.password_hash);
}

/** Sets a new local password. Authorised by the school's license key (offline recovery). */
export async function resetLocalPassword(email, newPassword, licenseKey) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const stored = getStoredLicense()?.licenseKey;
  if (!stored || String(licenseKey || '').trim().toUpperCase() !== stored.toUpperCase()) {
    return { ok: false, error: 'Reset key does not match the license key of this installation.' };
  }
  const profile = (await listLocalProfiles()).find((p) => (p.email || '').toLowerCase() === cleanEmail);
  if (!profile) return { ok: false, error: 'No local account exists with this email.' };
  const { error } = await createLocalTableQueryBuilder('user_profiles')
    .update({ password_hash: await hashPassword(newPassword), updated_at: new Date().toISOString() })
    .eq('id', profile.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Unified Authentication Engine.
 * Cloud web mode: Supabase Auth only. Desktop / offline mode: local accounts with PBKDF2 password hashes.
 */
export const unifiedAuth = {
  async signInWithPassword({ email, password }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) return authError('Please enter your email and password.');

    if (!isLocalAuthMode()) {
      try {
        const res = await getSupabaseClient().auth.signInWithPassword({ email: cleanEmail, password });
        if (!res.error && res.data?.user) setStoredAuthUser(res.data.user);
        return res;
      } catch (err) {
        return authError('Cannot reach the server. Check your internet connection. (' + (err?.message || err) + ')');
      }
    }

    const profile = (await listLocalProfiles()).find((p) => (p.email || '').toLowerCase() === cleanEmail);
    if (!profile || !(await verifyPassword(password, profile.password_hash))) {
      return authError(
        profile && !profile.password_hash
          ? 'This account has no password yet. Ask the owner to reset it, or use "Forgot password" with the license key.'
          : 'Invalid email or password.'
      );
    }
    if (profile.is_active === false) return authError('This account has been deactivated. Please contact the institution owner.');
    return signedIn(toSessionUser(profile));
  },

  async signUp({ email, password, options }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password || password.length < 6) return authError('Enter an email and a password of at least 6 characters.');

    if (!isLocalAuthMode()) {
      const res = await getSupabaseClient().auth.signUp({ email: cleanEmail, password, options });
      if (!res.error && res.data?.session?.user) setStoredAuthUser(res.data.session.user);
      return res;
    }

    // Locally, sign-up is only the first-run owner setup. Further staff are added by the owner in Settings → Users.
    if (!(await needsLocalOwnerSetup())) {
      return authError('An owner account already exists on this computer. Ask the owner to add you in Settings → Users.');
    }
    const existing = (await listLocalProfiles()).find((p) => (p.email || '').toLowerCase() === cleanEmail);
    const now = new Date().toISOString();
    const owner = {
      id: existing?.id || 'usr_' + crypto.randomUUID(),
      email: cleanEmail,
      full_name: options?.data?.full_name || cleanEmail.split('@')[0] || 'Owner',
      role: 'owner',
      permissions: OWNER_PERMISSIONS,
      is_active: true,
      password_hash: await hashPassword(password),
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    const q = createLocalTableQueryBuilder('user_profiles');
    const { error } = existing ? await q.update(owner).eq('id', existing.id) : await q.insert(owner);
    if (error) return { data: { user: null, session: null }, error };
    return signedIn(toSessionUser(owner));
  },

  async getSession() {
    if (!isLocalAuthMode()) {
      try {
        const res = await getSupabaseClient().auth.getSession();
        if (res.data?.session) return res;
      } catch {}
      return { data: { session: null }, error: null };
    }
    const stored = getStoredAuthUser();
    return { data: { session: stored ? { user: stored, access_token: 'offline-token' } : null }, error: null };
  },

  async getUser() {
    const { data } = await this.getSession();
    return {
      data: { user: data?.session?.user || null },
      error: null,
    };
  },

  async signOut() {
    const client = getSupabaseClient();
    if (client && client.auth) {
      try {
        await client.auth.signOut();
      } catch {}
    }
    setStoredAuthUser(null);
    return { error: null };
  },

  onAuthStateChange(callback) {
    offlineAuthListeners.add(callback);

    const client = getSupabaseClient();
    let clientSub = null;
    if (client && client.auth) {
      try {
        const res = client.auth.onAuthStateChange((event, session) => {
          if (session?.user) {
            setStoredAuthUser(session.user);
          }
          callback(event, session);
        });
        clientSub = res.data?.subscription;
      } catch {}
    }

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            offlineAuthListeners.delete(callback);
            clientSub?.unsubscribe?.();
          },
        },
      },
    };
  },

  async refreshSession() {
    return await this.getSession();
  },

  async resetPasswordForEmail(email) {
    const client = getSupabaseClient();
    if (client && client.auth) {
      try {
        return await client.auth.resetPasswordForEmail(email);
      } catch {}
    }
    return { data: {}, error: null };
  },
};

/**
 * Proxy object representing the Supabase client.
 * Dynamically resolves all property and method calls to the active school's database client.
 * Allows all existing imports (`import { supabase } from '...'`) to work seamlessly.
 */
export const supabase = new Proxy({}, {
  get(_target, prop) {
    const mode = getStorageMode();
    if (prop === 'from') {
      if (mode === 'offline') {
        return (tableName) => createLocalTableQueryBuilder(tableName);
      }
      const client = getSupabaseClient();
      if (!client) {
        return (tableName) => createLocalTableQueryBuilder(tableName);
      }
      return (tableName) => client.from(tableName);
    }

    if (prop === 'auth') {
      return unifiedAuth;
    }

    const client = getSupabaseClient();
    if (!client) {
      return undefined;
    }
    const val = client[prop];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});


/**
 * Boolean flag indicating if database engine is active and configured
 */
export let isSupabaseConfigured = true;

export const supabaseConfig = {
  get url() {
    return getActiveDatabaseConfig().url;
  },
  get configured() {
    return getActiveDatabaseConfig().configured;
  },
  get schoolName() {
    return getActiveDatabaseConfig().schoolName;
  },
  get isCustomSchoolDb() {
    return getActiveDatabaseConfig().isCustomSchoolDb;
  },
};

/**
 * Performs a live connectivity check against the active Supabase endpoint.
 * Does not modify any database tables.
 * Returns { ok, configured, url, schoolName, latencyMs, error, statusText }
 */
export async function checkSupabaseConnection() {
  const config = getActiveDatabaseConfig();

  if (!config.configured) {
    let missing = [];
    if (!config.url) missing.push('Supabase URL');
    if (!config.key) missing.push('Supabase Publishable Key');

    return {
      ok: false,
      configured: false,
      url: null,
      schoolName: config.schoolName,
      error: `Missing database configuration: ${missing.join(', ')}.`,
      statusText: 'Not Configured',
      latencyMs: 0,
    };
  }

  const startTime = performance.now();

  try {
    // Ping the Supabase GoTrue Auth health endpoint
    const response = await fetch(`${config.url}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: config.key,
      },
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (response.ok) {
      const data = await response.json();
      return {
        ok: true,
        configured: true,
        url: config.url,
        schoolName: config.schoolName,
        isCustomSchoolDb: config.isCustomSchoolDb,
        version: data?.version || 'Active',
        statusText: 'Connected & Reachable',
        latencyMs,
      };
    }

    if (response.status === 401) {
      return {
        ok: false,
        configured: true,
        url: config.url,
        schoolName: config.schoolName,
        error: 'Authentication failed (401): The provided publishable key was rejected by Supabase.',
        statusText: 'Unauthorized',
        latencyMs,
      };
    }

    return {
      ok: false,
      configured: true,
      url: config.url,
      schoolName: config.schoolName,
      error: `Supabase server returned HTTP ${response.status}: ${response.statusText}`,
      statusText: `HTTP Error ${response.status}`,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      ok: false,
      configured: true,
      url: config.url,
      schoolName: config.schoolName,
      error: err?.message || 'Network error: Unable to reach the Supabase endpoint.',
      statusText: 'Connection Failed',
      latencyMs,
    };
  }
}
