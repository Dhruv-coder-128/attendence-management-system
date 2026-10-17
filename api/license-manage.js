/**
 * SMS — Student Management System
 * Serverless API: /api/license-manage
 * Privileged Master Developer Endpoint for SaaS License Management
 * Allows Dhruv Shah (System Developer) to register, lock, suspend, extend, and monitor client licenses.
 */

import { createClient } from '@supabase/supabase-js';

const MASTER_DEV_PIN = '8866';
const DEVELOPER_EMAIL = 'dushah2007@gmail.com';
const DEFAULT_CONTACT = {
  name: 'Dhruv Shah',
  email: 'dushah2007@gmail.com',
  phone: '+91 8866039007',
  whatsapp: '+91 8866039007',
};

export default async function handler(req, res) {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-developer-secret, x-developer-pin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Authorize caller: developer pin, secret, or owner email token
  const devPinHeader = req.headers['x-developer-pin'] || '';
  const devSecretHeader = req.headers['x-developer-secret'] || '';
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const isPinValid = devPinHeader === MASTER_DEV_PIN || devPinHeader === '8866';
  const isSecretValid = devSecretHeader && (devSecretHeader === process.env.DEVELOPER_SECRET || devSecretHeader === DEVELOPER_EMAIL);

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      ok: false,
      error: 'Licensing server configuration missing: SUPABASE_SERVICE_ROLE_KEY is required.',
    });
  }

  const serverDb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let isAuthorized = isPinValid || isSecretValid;

  if (!isAuthorized && token) {
    try {
      const { data: { user } } = await serverDb.auth.getUser(token);
      if (user && user.email?.trim().toLowerCase() === DEVELOPER_EMAIL) {
        isAuthorized = true;
      }
    } catch {}
  }

  if (!isAuthorized) {
    return res.status(403).json({
      ok: false,
      error: 'Access Denied: Only System Developer (Dhruv Shah) can access the SaaS Master License Management API.',
    });
  }

  // GET: List all registered school licenses
  if (req.method === 'GET') {
    try {
      const { data, error } = await serverDb
        .from('school_licenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ ok: true, licenses: data || [] });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // POST: Create, Suspend, Extend, or Update License
  if (req.method === 'POST') {
    const { action, license, licenseKey, durationDays, newStatus } = req.body || {};

    try {
      // 1. Create or Upsert full license
      if (action === 'upsert' && license) {
        const cleanKey = String(license.licenseKey || '').trim().toUpperCase();
        if (!cleanKey) {
          return res.status(400).json({ ok: false, error: 'licenseKey is required.' });
        }

        const payload = {
          id: license.id || `LIC-${cleanKey}`,
          school_name: license.schoolName || 'SMS Academy',
          license_key: cleanKey,
          school_supabase_url: license.databaseConfig?.supabaseUrl || supabaseUrl,
          school_supabase_anon_key: license.databaseConfig?.supabaseAnonKey || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
          is_activated: license.isActivated !== false,
          status: license.status || 'trial_active',
          trial_started_at: license.trialStartedAt || new Date().toISOString(),
          trial_ends_at: license.trialEndsAt || new Date(Date.now() + 30 * 86400000).toISOString(),
          contact_developer: license.contactDeveloper || DEFAULT_CONTACT,
          notes: license.notes || '',
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await serverDb
          .from('school_licenses')
          .upsert(payload, { onConflict: 'license_key' })
          .select()
          .maybeSingle();

        if (error) throw error;
        return res.status(200).json({ ok: true, license: data });
      }

      // 2. Suspend / Lock school license
      if (action === 'suspend') {
        const cleanKey = String(licenseKey).trim().toUpperCase();
        const { data, error } = await serverDb
          .from('school_licenses')
          .update({
            status: 'suspended',
            updated_at: new Date().toISOString(),
          })
          .eq('license_key', cleanKey)
          .select()
          .maybeSingle();

        if (error) throw error;
        return res.status(200).json({ ok: true, message: `License ${cleanKey} suspended successfully.`, license: data });
      }

      // 3. Unlock / Restore school license
      if (action === 'unlock' || action === 'activate') {
        const cleanKey = String(licenseKey).trim().toUpperCase();
        const { data, error } = await serverDb
          .from('school_licenses')
          .update({
            status: newStatus || 'trial_active',
            updated_at: new Date().toISOString(),
          })
          .eq('license_key', cleanKey)
          .select()
          .maybeSingle();

        if (error) throw error;
        return res.status(200).json({ ok: true, message: `License ${cleanKey} unlocked successfully.`, license: data });
      }

      // 4. Update / Extend Days
      if (action === 'set_days') {
        const cleanKey = String(licenseKey).trim().toUpperCase();
        const days = parseInt(durationDays, 10) || 0;
        const now = new Date();
        const newEndsAt = new Date(now.getTime() + days * 86400000).toISOString();
        const computedStatus = days > 0 ? (days >= 365 ? 'licensed' : 'trial_active') : 'trial_expired';

        const { data, error } = await serverDb
          .from('school_licenses')
          .update({
            status: computedStatus,
            trial_ends_at: newEndsAt,
            updated_at: now.toISOString(),
          })
          .eq('license_key', cleanKey)
          .select()
          .maybeSingle();

        if (error) throw error;
        return res.status(200).json({ ok: true, message: `License ${cleanKey} set to ${days} days.`, license: data });
      }

      // 5. Delete school license
      if (action === 'delete') {
        const cleanKey = String(licenseKey).trim().toUpperCase();
        const { error } = await serverDb
          .from('school_licenses')
          .delete()
          .eq('license_key', cleanKey);

        if (error) throw error;
        return res.status(200).json({ ok: true, message: `License ${cleanKey} deleted.` });
      }

      return res.status(400).json({ ok: false, error: 'Unknown action specified.' });
    } catch (err) {
      console.error('License management error:', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
}
