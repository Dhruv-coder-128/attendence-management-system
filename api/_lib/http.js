// Shared helpers for the remaining server endpoints (parent portal, staff management). Not exposed as a route.
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

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
