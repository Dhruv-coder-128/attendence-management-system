// Shared server-side checks for staff-only and Telegram endpoints.
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * Returns null when the caller (Bearer JWT) is an active staff member with `perm`,
 * otherwise { status, error } to send back. Uses the public.staff_can() SQL function.
 */
export async function staffCheck(req, perm) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !url || !anonKey) return { status: 401, error: 'Please sign in first.' };
  const client = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.rpc('staff_can', { perm });
  return !error && data === true ? null : { status: 403, error: 'You do not have permission for this action.' };
}

/** Secret Telegram echoes back in X-Telegram-Bot-Api-Secret-Token; derived from the bot token so no extra env var. */
export function telegramWebhookSecret(botToken) {
  return crypto.createHash('sha256').update('sms-webhook:' + botToken).digest('hex');
}
