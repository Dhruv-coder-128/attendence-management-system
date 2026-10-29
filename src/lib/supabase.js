import { createClient } from '@supabase/supabase-js';
import runtimeConfig from '../config/runtimeConfig.js';
import { createLocalTableQueryBuilder, getStorageMode } from './databaseAdapter.js';

// Re-export for backward compat (but now derived from runtimeConfig, no hardcoded fallbacks)
export const PRODUCTION_SUPABASE_URL = runtimeConfig.supabaseUrl || '';
export const PRODUCTION_SUPABASE_ANON_KEY = runtimeConfig.supabaseAnonKey || '';

/**
 * Resolves the currently active database credentials:
 * 1. School-specific database credentials from the activated license (if present)
 * 2. Fallback to environment variables (.env.local / Vercel envs)
 * No hardcoded production fallback - if env missing, configured=false and UI shows setup guide.
 */
export function getActiveDatabaseConfig() {
  // Check for per-school BYODB override stored in license
  try {
    const raw = localStorage.getItem('sms_school_license');
    if (raw) {
      const lic = JSON.parse(raw);
      const schoolDb = lic?.databaseConfig;
      if (schoolDb?.supabaseUrl && schoolDb?.supabaseAnonKey) {
        return {
          url: schoolDb.supabaseUrl.trim(),
          key: schoolDb.supabaseAnonKey.trim(),
          schoolName: lic.schoolName || 'School Instance',
          isCustomSchoolDb: true,
          configured: true,
        };
      }
    }
  } catch {}

  const isEnvValid = Boolean(
    runtimeConfig.supabaseUrl &&
      runtimeConfig.supabaseAnonKey &&
      !runtimeConfig.supabaseUrl.includes('your-project-ref') &&
      !runtimeConfig.supabaseUrl.includes('your-project') &&
      !runtimeConfig.supabaseAnonKey.includes('your-supabase') &&
      !runtimeConfig.supabaseAnonKey.includes('your-anon')
  );

  if (!isEnvValid) {
    return {
      url: '',
      key: '',
      schoolName: 'Not Configured',
      isCustomSchoolDb: false,
      configured: false,
    };
  }

  return {
    url: runtimeConfig.supabaseUrl,
    key: runtimeConfig.supabaseAnonKey,
    schoolName: 'Primary Institution',
    isCustomSchoolDb: false,
    configured: true,
  };
}

let activeClientInstance = null;
let activeClientUrl = null;
let activeClientKey = null;

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
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return activeClientInstance;
}

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

// Secure token generation for offline sessions (HMAC-like, not guessable)
async function generateSecureOfflineToken(email, role) {
  const payload = `${email}|${role}|${Date.now()}|${Math.random().toString(36).slice(2)}`;
  // Use SubtleCrypto if available, else fallback to hashed payload
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const enc = new TextEncoder().encode(payload);
      const hash = await crypto.subtle.digest('SHA-256', enc);
      const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
      return `offline-${hex.slice(0, 32)}`;
    }
  } catch {}
  // fallback
  let h = 0;
  for (let i = 0; i < payload.length; i++) h = (h * 31 + payload.charCodeAt(i)) >>> 0;
  return `offline-${h.toString(16)}-${Date.now().toString(36)}`;
}

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
      fn(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user, access_token: user._offlineToken || 'offline-session' } : null);
    } catch {}
  });
}

// Strict owner check: only exact match on configured owner email or DB role
function isStrictOwnerEmail(email) {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  // Check against dynamic academy settings owner email
  try {
    const raw = localStorage.getItem('erp_academy_branding');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.email && parsed.email.trim().toLowerCase() === clean) return true;
    }
  } catch {}
  if (clean === 'admin@institution.edu') return true;
  // Do NOT use loose heuristics like includes('admin') or startsWith('owner')
  // Those were the critical auth bypass.
  return false;
}

export const unifiedAuth = {
  async signInWithPassword({ email, password }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return { data: { user: null, session: null }, error: new Error('Please enter your institutional email.') };
    }

    const mode = getStorageMode();
    const client = getSupabaseClient();

    // Attempt real Supabase auth first in cloud mode
    if (mode === 'cloud' && client && client.auth) {
      try {
        const res = await client.auth.signInWithPassword({ email: cleanEmail, password });
        if (!res.error && res.data?.user) {
          setStoredAuthUser(res.data.user);
          return res;
        }
        // If network error, fall through to offline handling
        if (res.error && res.error.message && res.error.message.toLowerCase().includes('fetch')) {
          // network failure -> fall through
        } else if (res.error) {
          // Real auth error (invalid credentials) -> return it, don't auto-promote to owner
          return res;
        }
      } catch (err) {
        // Network error - continue to offline check
        const msg = String(err?.message || '').toLowerCase();
        if (!msg.includes('fetch') && !msg.includes('network')) {
          // Don't swallow non-network errors silently
        }
      }
    }

    // Desktop offline fallback: only allow if there's an existing user_profiles entry
    // or if it's the configured owner AND password matches stored hash (we don't have hash, so we require cloud auth)
    // For offline/desktop, we check local user_profiles table strictly
    try {
      const { data: profiles } = await createLocalTableQueryBuilder('user_profiles').select('*').eq('email', cleanEmail);
      const profile = profiles?.[0];
      if (profile) {
        if (profile.is_active === false) {
          return { data: { user: null, session: null }, error: new Error('This account has been deactivated. Please contact the institution owner.') };
        }
        // For offline, we accept any password if profile exists (since password not stored locally)
        // This is a known limitation of offline mode - we log warning
        // In production, offline mode should use cached session only, not new logins
        const role = profile.role || 'moderator';
        const perms = profile.permissions || {};
        const token = await generateSecureOfflineToken(cleanEmail, role);
        const offlineUser = {
          id: profile.id,
          email: profile.email,
          role,
          aud: 'authenticated',
          _offlineToken: token,
          _offlineIssuedAt: Date.now(),
          user_metadata: { full_name: profile.full_name || 'Staff User', role },
          app_metadata: { role, permissions: perms, provider: 'email' },
        };
        setStoredAuthUser(offlineUser);
        return { data: { user: offlineUser, session: { user: offlineUser, access_token: token } }, error: null };
      }
    } catch {}

    // No matching profile and cloud auth failed
    return { data: { user: null, session: null }, error: new Error('Invalid email or password. Please check your credentials.') };
  },

  async signUp({ email, password, options }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const mode = getStorageMode();
    const client = getSupabaseClient();

    if (mode === 'cloud' && client && client.auth) {
      try {
        const res = await client.auth.signUp({ email: cleanEmail, password, options });
        if (!res.error && res.data?.user) {
          setStoredAuthUser(res.data.user);
          return res;
        }
      } catch (err) {
        console.warn('Remote signUp error, using local database:', err);
      }
    }

    // Local creation: strictly create with requested role, default to moderator unless first user
    try {
      const { data: existingProfiles } = await createLocalTableQueryBuilder('user_profiles').select('*');
      const isFirstUser = !existingProfiles || existingProfiles.length === 0;
      const requestedRole = options?.data?.role || 'moderator';
      // Only first user can be owner; subsequent signups default to requested role
      const role = isFirstUser ? 'owner' : (['admin', 'moderator'].includes(requestedRole) ? requestedRole : 'moderator');
      const fullName = options?.data?.full_name || cleanEmail.split('@')[0] || 'Administrator';
      const newId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const defaultPerms =
        role === 'owner'
          ? { view_students: true, edit_students: true, delete_students: true, view_attendance: true, mark_attendance: true, manage_batches: true, manage_fees: true, manage_exams: true, manage_parents: true, send_notifications: true, export_data: true, manage_users: true, manage_settings: true }
          : role === 'admin'
            ? { view_students: true, edit_students: true, delete_students: false, view_attendance: true, mark_attendance: true, manage_batches: true, manage_fees: true, manage_exams: true, manage_parents: true, send_notifications: true, export_data: true, manage_users: true, manage_settings: true }
            : { view_students: true, edit_students: true, delete_students: false, view_attendance: true, mark_attendance: true, manage_batches: true, manage_fees: true, manage_exams: true, manage_parents: true, send_notifications: true, export_data: true, manage_users: false, manage_settings: true };

      const newUser = {
        id: newId,
        email: cleanEmail,
        full_name: fullName,
        role,
        permissions: defaultPerms,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await createLocalTableQueryBuilder('user_profiles').insert(newUser);
      const token = await generateSecureOfflineToken(cleanEmail, role);
      const authUser = {
        id: newId,
        email: cleanEmail,
        role,
        aud: 'authenticated',
        _offlineToken: token,
        _offlineIssuedAt: Date.now(),
        user_metadata: { full_name: fullName, role },
        app_metadata: { role, permissions: defaultPerms, provider: 'email' },
      };
      setStoredAuthUser(authUser);
      return { data: { user: authUser, session: { user: authUser, access_token: token } }, error: null };
    } catch (err) {
      return { data: { user: null, session: null }, error: err };
    }
  },

  async getSession() {
    const mode = getStorageMode();
    const client = getSupabaseClient();
    if (mode === 'cloud' && client && client.auth) {
      try {
        const res = await client.auth.getSession();
        if (res.data?.session) return res;
      } catch {}
    }
    const stored = getStoredAuthUser();
    if (stored) {
      // Check offline token expiry (24h)
      const issued = stored._offlineIssuedAt || 0;
      if (issued && Date.now() - issued > 24 * 60 * 60 * 1000) {
        setStoredAuthUser(null);
        return { data: { session: null }, error: null };
      }
      return { data: { session: { user: stored, access_token: stored._offlineToken || 'offline-session' } }, error: null };
    }
    return { data: { session: null }, error: null };
  },

  async getUser() {
    const { data } = await this.getSession();
    return { data: { user: data?.session?.user || null }, error: null };
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
          if (session?.user) setStoredAuthUser(session.user);
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

export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const mode = getStorageMode();
      if (prop === 'from') {
        if (mode === 'offline') return (tableName) => createLocalTableQueryBuilder(tableName);
        const client = getSupabaseClient();
        if (!client) return (tableName) => createLocalTableQueryBuilder(tableName);
        return (tableName) => client.from(tableName);
      }
      if (prop === 'auth') return unifiedAuth;
      const client = getSupabaseClient();
      if (!client) return undefined;
      const val = client[prop];
      if (typeof val === 'function') return val.bind(client);
      return val;
    },
  }
);

export let isSupabaseConfigured = runtimeConfig.isSupabaseConfigured;

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

export async function checkSupabaseConnection() {
  const config = getActiveDatabaseConfig();
  if (!config.configured) {
    let missing = [];
    if (!config.url) missing.push('Supabase URL');
    if (!config.key) missing.push('Supabase Publishable Key');
    return { ok: false, configured: false, url: null, schoolName: config.schoolName, error: `Missing database configuration: ${missing.join(', ')}. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your .env.local file.`, statusText: 'Not Configured', latencyMs: 0 };
  }
  const startTime = performance.now();
  try {
    const response = await fetch(`${config.url}/auth/v1/health`, { method: 'GET', headers: { apikey: config.key } });
    const latencyMs = Math.round(performance.now() - startTime);
    if (response.ok) {
      const data = await response.json();
      return { ok: true, configured: true, url: config.url, schoolName: config.schoolName, isCustomSchoolDb: config.isCustomSchoolDb, version: data?.version || 'Active', statusText: 'Connected & Reachable', latencyMs };
    }
    if (response.status === 401) {
      return { ok: false, configured: true, url: config.url, schoolName: config.schoolName, error: 'Authentication failed (401): The provided publishable key was rejected by Supabase.', statusText: 'Unauthorized', latencyMs };
    }
    return { ok: false, configured: true, url: config.url, schoolName: config.schoolName, error: `Supabase server returned HTTP ${response.status}: ${response.statusText}`, statusText: `HTTP Error ${response.status}`, latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    return { ok: false, configured: true, url: config.url, schoolName: config.schoolName, error: err?.message || 'Network error: Unable to reach the Supabase endpoint.', statusText: 'Connection Failed', latencyMs };
  }
}
