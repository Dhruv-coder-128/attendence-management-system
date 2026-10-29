/**
 * SMS — Runtime Configuration
 * Single source of truth for all environment-driven values.
 * No hardcoded production secrets here — everything comes from env.
 * For local dev, copy .env.example -> .env.local and fill in.
 */

function readEnv(key) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key] !== undefined) {
      const v = String(import.meta.env[key] || '').trim();
      if (v) return v;
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
      const v = String(process.env[key] || '').trim();
      if (v) return v;
    }
  } catch {}
  return '';
}

// --- Supabase ---
export const SUPABASE_URL = readEnv('VITE_SUPABASE_URL') || readEnv('SUPABASE_URL');
export const SUPABASE_ANON_KEY =
  readEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  readEnv('VITE_SUPABASE_ANON_KEY') ||
  readEnv('SUPABASE_ANON_KEY');

// Strict check: app is configured only if both URL and key are present via env.
// No hardcoded fallback URL/key — if missing, UI shows setup guide.
export const IS_SUPABASE_ENV_CONFIGURED = Boolean(
  SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes('your-project-ref') &&
    !SUPABASE_URL.includes('your-project') &&
    !SUPABASE_ANON_KEY.includes('your-supabase') &&
    !SUPABASE_ANON_KEY.includes('your-anon')
);

// --- Production API ---
export const PRODUCTION_API_URL =
  readEnv('VITE_PRODUCTION_API_URL') || readEnv('PRODUCTION_API_URL') || '';

// --- Telegram (public username only) ---
export const TELEGRAM_BOT_USERNAME = readEnv('VITE_TELEGRAM_BOT_USERNAME') || '';

// --- Master Admin ---
// Comma-separated list of emails allowed to open Admin Console
export const MASTER_ADMIN_EMAILS = (readEnv('VITE_MASTER_ADMIN_EMAILS') || readEnv('MASTER_ADMIN_EMAILS') || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Fallback single owner email (legacy)
const legacyOwner = readEnv('VITE_OWNER_EMAIL') || readEnv('OWNER_EMAIL') || '';
if (legacyOwner && !MASTER_ADMIN_EMAILS.includes(legacyOwner.toLowerCase())) {
  MASTER_ADMIN_EMAILS.push(legacyOwner.toLowerCase());
}

// --- Support Contact Defaults (overridable via academy_settings DB) ---
export const DEFAULT_SUPPORT_CONTACT = {
  name: readEnv('VITE_SUPPORT_NAME') || 'Support Team',
  email: readEnv('VITE_SUPPORT_EMAIL') || '',
  phone: readEnv('VITE_SUPPORT_PHONE') || '',
  whatsapp: readEnv('VITE_SUPPORT_WHATSAPP') || readEnv('VITE_SUPPORT_PHONE') || '',
};

// --- App Meta ---
export const APP_NAME = readEnv('VITE_APP_NAME') || 'SMS — Student Management System';
export const APP_VERSION = readEnv('VITE_APP_VERSION') || '1.0.11';

// Central config object
const runtimeConfig = {
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  isSupabaseConfigured: IS_SUPABASE_ENV_CONFIGURED,
  productionApiUrl: PRODUCTION_API_URL,
  telegramBotUsername: TELEGRAM_BOT_USERNAME,
  masterAdminEmails: MASTER_ADMIN_EMAILS,
  supportContact: DEFAULT_SUPPORT_CONTACT,
  appName: APP_NAME,
  appVersion: APP_VERSION,
};

export default runtimeConfig;
