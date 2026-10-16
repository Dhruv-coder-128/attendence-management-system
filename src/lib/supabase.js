import { createClient } from '@supabase/supabase-js';
import { getStoredLicense } from './licenseService.js';

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

/**
 * Proxy object representing the Supabase client.
 * Dynamically resolves all property and method calls to the active school's database client.
 * Allows all existing imports (`import { supabase } from '...'`) to work seamlessly.
 */
export const supabase = new Proxy({}, {
  get(_target, prop) {
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
 * Boolean flag indicating if Supabase is configured for the active context
 */
export let isSupabaseConfigured = Boolean(
  getActiveDatabaseConfig().configured
);

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
