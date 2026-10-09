import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Client Module
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from environment variables.
 * Safe for client-side execution (never uses service_role or secret keys).
 */

const rawUrl = (
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  ''
).trim();

const rawKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  ''
).trim();

// Check if valid configuration is provided and not default placeholders
export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawKey &&
  rawUrl !== 'https://your-project-ref.supabase.co' &&
  !rawUrl.includes('your-project') &&
  !rawKey.includes('your-anon-public-key') &&
  !rawKey.includes('your-supabase-publishable')
);

export const supabaseConfig = {
  url: isSupabaseConfigured ? rawUrl : '',
  configured: isSupabaseConfigured,
};

// Simple reusable Supabase client instance
export const supabase = isSupabaseConfigured
  ? createClient(rawUrl, rawKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

/**
 * Performs a live connectivity check against the Supabase endpoint.
 * Does not modify any database tables.
 * Returns { ok, configured, url, latencyMs, error, statusText }
 */
export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured) {
    let missing = [];
    if (!rawUrl) missing.push('VITE_SUPABASE_URL');
    if (!rawKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');

    return {
      ok: false,
      configured: false,
      url: null,
      error: `Missing configuration: ${missing.join(', ')} is not defined in .env.local`,
      statusText: 'Not Configured',
      latencyMs: 0,
    };
  }

  const startTime = performance.now();

  try {
    // Ping the Supabase GoTrue Auth health endpoint
    const response = await fetch(`${rawUrl}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: rawKey,
      },
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (response.ok) {
      const data = await response.json();
      return {
        ok: true,
        configured: true,
        url: rawUrl,
        version: data?.version || 'Active',
        statusText: 'Connected & Reachable',
        latencyMs,
      };
    }

    if (response.status === 401) {
      return {
        ok: false,
        configured: true,
        url: rawUrl,
        error: 'Authentication failed (401): The provided publishable key was rejected by Supabase.',
        statusText: 'Unauthorized',
        latencyMs,
      };
    }

    return {
      ok: false,
      configured: true,
      url: rawUrl,
      error: `Supabase server returned HTTP ${response.status}: ${response.statusText}`,
      statusText: `HTTP Error ${response.status}`,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      ok: false,
      configured: true,
      url: rawUrl,
      error: err?.message || 'Network error: Unable to reach the Supabase endpoint.',
      statusText: 'Connection Failed',
      latencyMs,
    };
  }
}
