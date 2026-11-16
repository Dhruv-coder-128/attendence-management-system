// Shared server-side helpers for /api/license-*. Files under api/_lib are not exposed as routes by Vercel.
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const DAY = 86400000;
export const TRIAL_DAYS = { universal_trial: 30, grace: 5, school: 30 };

export const DEVELOPER_CONTACT = {
  name: process.env.DEVELOPER_NAME || 'Dhruv Shah',
  email: process.env.DEVELOPER_EMAIL || '',
  phone: process.env.DEVELOPER_PHONE || '+91 8866039007',
  whatsapp: process.env.DEVELOPER_WHATSAPP || process.env.DEVELOPER_PHONE || '+91 8866039007',
};

// Browser origins allowed to call the API. Native apps: Tauri (Windows) and Capacitor (Android).
const DEFAULT_ORIGINS = [
  'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost',
  'https://localhost', 'http://localhost', 'capacitor://localhost',
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'https://attendence-management-system-lovat.vercel.app',
];
const ALLOWED_ORIGINS = new Set([
  ...DEFAULT_ORIGINS,
  ...String(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
]);

/** Sets CORS headers for allowed origins only. Returns true when the request was a handled preflight. */
export function applyCors(req, res, methods = 'POST, OPTIONS', headers = 'Content-Type, Authorization') {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', headers);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

// shortcut: per-instance memory, so limits are per warm serverless instance, not global. Enough to stop
// casual brute force; use Upstash/Vercel KV if real abuse shows up.
const hits = new Map();
export function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.start > windowMs) {
    hits.set(key, { start: now, count: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

/** Checks a limit without counting this request (use with rateLimited() to count only failures). */
export function overLimit(key, max, windowMs) {
  const entry = hits.get(key);
  return Boolean(entry && Date.now() - entry.start <= windowMs && entry.count >= max);
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

export function getServerDb() {
  if (globalThis.__smsTestDb) return globalThis.__smsTestDb; // set only by tests/security.test.mjs
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export const cleanKey = (k) => String(k || '').trim().toUpperCase();
export const daysLeft = (endsAt, now = Date.now()) =>
  endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / DAY)) : 9999;
export const addDays = (days, from = Date.now()) => new Date(from + days * DAY).toISOString();

export async function findLicense(db, key) {
  const { data, error } = await db.from('school_licenses').select('*').eq('license_key', cleanKey(key)).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateLicense(db, id, patch) {
  const { data, error } = await db
    .from('school_licenses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Computes what the client should see for a license on a given device.
 * `grant` is the per-device record for universal trial / grace keys.
 */
export function licenseView(row, deviceId, now = Date.now()) {
  const grant = row.kind === 'school' ? null : row.device_grants?.[deviceId];
  const endsAt = grant ? grant.trial_ends_at : row.trial_ends_at;
  const expired = Boolean(endsAt) && new Date(endsAt).getTime() <= now;
  const status = row.is_locked ? 'suspended' : expired ? 'trial_expired' : row.status === 'licensed' ? 'licensed' : 'trial_active';
  return {
    ok: status === 'licensed' || status === 'trial_active',
    status,
    licenseId: row.id,
    licenseKey: row.license_key,
    schoolName: row.kind === 'school' ? row.school_name : row.kind === 'grace' ? 'Emergency Grace Extension' : 'Evaluation Trial School',
    trialStartedAt: grant ? grant.granted_at : row.trial_started_at,
    trialEndsAt: endsAt || null,
    daysRemaining: daysLeft(endsAt, now),
    maxStudents: row.max_students || 200,
    isTimerVisible: row.is_timer_visible !== false && status === 'trial_active',
    boundDeviceId: row.kind === 'school' ? row.bound_device_id : deviceId,
    databaseConfig: row.school_supabase_url && row.school_supabase_anon_key
      ? { supabaseUrl: row.school_supabase_url, supabaseAnonKey: row.school_supabase_anon_key }
      : undefined,
    developerContact: DEVELOPER_CONTACT,
    serverTime: new Date(now).toISOString(),
  };
}

export const STATUS_ERRORS = {
  suspended: 'This school license has been suspended. Please contact the developer to resolve.',
  trial_expired: 'Your license period has ended. Please contact the developer to renew.',
  device_mismatch: 'This license key is already bound to another computer. Contact the developer to move it.',
  not_activated: 'This computer has not activated this key. Please activate the license again.',
};

/** Validates the common request body. Returns { key, deviceId } or an error string. */
export function readLicenseRequest(body) {
  const key = cleanKey(body?.licenseKey);
  const deviceId = String(body?.deviceId || '').trim();
  if (!key || key.length > 128) return { error: 'License key is required.' };
  if (!deviceId || deviceId.length > 200) return { error: 'Device ID is required. Please update the app.' };
  return { key, deviceId };
}
