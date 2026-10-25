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

/**
 * Resiliently fetches all registered licenses from school_licenses or fallback store
 */
async function fetchLicensesResilient(serverDb) {
  // 1. Try school_licenses
  const { data, error } = await serverDb
    .from('school_licenses')
    .select('*')
    .order('created_at', { ascending: false });

  if (!error) return data || [];

  // 2. If school_licenses not in schema cache (PGRST205 / 42P01), fallback to courses table
  if (error.code === 'PGRST205' || error.code === '42P01' || String(error.message || '').includes('school_licenses')) {
    const { data: cData, error: cErr } = await serverDb
      .from('courses')
      .select('*')
      .like('code', 'LIC:%')
      .order('created_at', { ascending: false });

    if (cErr) throw cErr;
    return (cData || []).map((row) => {
      let parsed = {};
      try {
        parsed = JSON.parse(row.description) || {};
      } catch {}
      const schoolName = parsed.school_name || parsed.schoolName || row.name?.replace(/\s*\[.*\]/, '').trim() || 'SMS Client School';
      const cleanKey = parsed.license_key || parsed.licenseKey || row.code.replace(/^LIC:/, '');
      const isLocked = Boolean(parsed.is_locked || parsed.isLocked || !row.is_active || parsed.status === 'suspended');
      return {
        id: parsed.id || row.id || `LIC-${cleanKey}`,
        license_key: cleanKey,
        school_name: schoolName,
        contact_person: parsed.contact_person || parsed.contactPerson || 'Principal / Administrator',
        phone: parsed.phone || parsed.contact_developer?.phone || '',
        email: parsed.email || '',
        status: isLocked ? 'suspended' : (parsed.status || 'trial_active'),
        is_locked: isLocked,
        is_timer_visible: parsed.is_timer_visible !== undefined ? parsed.is_timer_visible : (parsed.isTimerVisible !== false),
        days_remaining: parsed.days_remaining !== undefined ? parsed.days_remaining : (parsed.daysRemaining !== undefined ? parsed.daysRemaining : 30),
        trial_ends_at: parsed.trial_ends_at || parsed.trialEndsAt,
        bound_device_id: parsed.bound_device_id || parsed.activated_device_id || row.activated_device_id || null,
        bound_at: parsed.bound_at || parsed.activated_at || null,
        notes: parsed.notes || '',
        created_at: row.created_at,
      };
    });
  }

  throw error;
}

/**
 * Resiliently upserts a license to school_licenses or fallback store
 */
async function upsertLicenseResilient(serverDb, payload) {
  // 1. Try school_licenses
  const { data, error } = await serverDb
    .from('school_licenses')
    .upsert(payload, { onConflict: 'license_key' })
    .select()
    .maybeSingle();

  if (!error) return data;

  // 2. If school_licenses not in schema cache, fallback to courses table
  if (error.code === 'PGRST205' || error.code === '42P01' || String(error.message || '').includes('school_licenses')) {
    const code = 'LIC:' + payload.license_key;
    const name = `${payload.school_name || 'SMS Academy'} [${String(payload.status || '').toUpperCase()}]`;
    const isActive = payload.status === 'licensed' || payload.status === 'trial_active';

    const { error: cErr } = await serverDb
      .from('courses')
      .upsert({
        code,
        name,
        level: 'License',
        description: JSON.stringify(payload),
        is_active: isActive,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'code' });

    if (cErr) throw cErr;
    return payload;
  }

  throw error;
}

/**
 * Resiliently updates a license status or duration
 */
async function updateLicenseStatusResilient(serverDb, cleanKey, updateObj) {
  // 1. Try school_licenses
  const { data, error } = await serverDb
    .from('school_licenses')
    .update(updateObj)
    .eq('license_key', cleanKey)
    .select()
    .maybeSingle();

  if (!error && data) return data;

  // 2. Fallback to courses
  if (!error || error.code === 'PGRST205' || error.code === '42P01' || String(error?.message || '').includes('school_licenses')) {
    const code = 'LIC:' + cleanKey;
    const { data: existing, error: getErr } = await serverDb
      .from('courses')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (getErr) throw getErr;

    let payload = {};
    if (existing && existing.description) {
      try {
        payload = JSON.parse(existing.description);
      } catch {}
    } else {
      payload = {
        id: `LIC-${cleanKey}`,
        license_key: cleanKey,
        school_name: 'SMS Academy',
        is_activated: true,
      };
    }

    Object.assign(payload, updateObj);
    const isActive = payload.status === 'licensed' || payload.status === 'trial_active';
    const name = `${payload.school_name || 'SMS Academy'} [${String(payload.status || '').toUpperCase()}]`;

    const { error: saveErr } = await serverDb
      .from('courses')
      .upsert({
        code,
        name,
        level: 'License',
        description: JSON.stringify(payload),
        is_active: isActive,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'code' });

    if (saveErr) throw saveErr;
    return payload;
  }

  throw error;
}

/**
 * Resiliently deletes a license
 */
async function deleteLicenseResilient(serverDb, cleanKey) {
  try {
    await serverDb.from('school_licenses').delete().eq('license_key', cleanKey);
  } catch {}
  try {
    await serverDb.from('courses').delete().eq('code', 'LIC:' + cleanKey);
  } catch {}
  return true;
}

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
      const licenses = await fetchLicensesResilient(serverDb);
      return res.status(200).json({ ok: true, licenses: licenses || [] });
    } catch (err) {
      console.error('Fetch licenses error:', err);
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

        const result = await upsertLicenseResilient(serverDb, payload);
        return res.status(200).json({ ok: true, license: result });
      }

      // 2. Suspend / Lock school license
      if (action === 'suspend') {
        const cleanKey = String(licenseKey).trim().toUpperCase();
        const updated = await updateLicenseStatusResilient(serverDb, cleanKey, {
          status: 'suspended',
          is_locked: true,
          updated_at: new Date().toISOString(),
        });

        return res.status(200).json({ ok: true, message: `License ${cleanKey} suspended successfully.`, license: updated });
      }

      // 3. Unlock / Restore school license
      if (action === 'unlock' || action === 'activate') {
        const cleanKey = String(licenseKey).trim().toUpperCase();
        const updated = await updateLicenseStatusResilient(serverDb, cleanKey, {
          status: newStatus || 'trial_active',
          is_locked: false,
          updated_at: new Date().toISOString(),
        });

        return res.status(200).json({ ok: true, message: `License ${cleanKey} unlocked successfully.`, license: updated });
      }

      // 4. Update / Extend / Adjust Days (Supports increase, decrease, and exact days)
      if (action === 'set_days' || action === 'adjust_days') {
        const cleanKey = String(licenseKey).trim().toUpperCase();
        let days = 0;
        if (action === 'adjust_days' && req.body?.deltaDays !== undefined) {
          const currentDays = parseInt(req.body?.currentDays, 10) || 0;
          days = Math.max(0, currentDays + parseInt(req.body?.deltaDays, 10));
        } else {
          days = Math.max(0, parseInt(durationDays, 10) || 0);
        }

        const now = new Date();
        const newEndsAt = new Date(now.getTime() + days * 86400000).toISOString();
        const computedStatus = days >= 9000 ? 'licensed' : (days > 0 ? 'trial_active' : 'trial_expired');
        const isLocked = days <= 0 && computedStatus !== 'licensed';

        const updated = await updateLicenseStatusResilient(serverDb, cleanKey, {
          status: computedStatus,
          is_locked: isLocked,
          days_remaining: days,
          trial_ends_at: newEndsAt,
          updated_at: now.toISOString(),
        });

        return res.status(200).json({ ok: true, message: `License ${cleanKey} set to ${days} days.`, license: updated, days });
      }

      // 5. Toggle Floating Timer Capsule Visibility on Client EXE/APK
      if (action === 'toggle_timer') {
        const cleanKey = String(licenseKey).trim().toUpperCase();
        const isTimerVisible = Boolean(req.body?.isTimerVisible);
        const updated = await updateLicenseStatusResilient(serverDb, cleanKey, {
          is_timer_visible: isTimerVisible,
          updated_at: new Date().toISOString(),
        });

        return res.status(200).json({ ok: true, message: `Timer visibility for ${cleanKey} updated to ${isTimerVisible ? 'ON' : 'OFF'}.`, license: updated });
      }

      // 6. Reset Workstation Hardware Binding (Unbind device)
      if (action === 'reset_device') {
        const cleanKey = String(licenseKey).trim().toUpperCase();
        const updated = await updateLicenseStatusResilient(serverDb, cleanKey, {
          bound_device_id: null,
          activated_device_id: null,
          is_activated: false,
          bound_at: null,
          activated_at: null,
          updated_at: new Date().toISOString(),
        });

        return res.status(200).json({
          ok: true,
          message: `Workstation binding for ${cleanKey} cleared successfully. School can now activate on a new computer.`,
          license: updated,
        });
      }

      // 7. Delete school license
      if (action === 'delete') {
        const cleanKey = String(licenseKey).trim().toUpperCase();
        await deleteLicenseResilient(serverDb, cleanKey);
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
