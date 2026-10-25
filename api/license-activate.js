/**
 * SMS — Student Management System
 * Serverless API: /api/license-activate
 * Activates a school license, starts the authoritative 30-day trial on the server,
 * and securely returns the school's publishable Supabase database credentials.
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const { licenseKey, deviceId = '' } = req.body || {};

  if (!licenseKey || typeof licenseKey !== 'string' || !licenseKey.trim()) {
    return res.status(400).json({ ok: false, error: 'License key is required for activation.' });
  }

  const cleanKey = licenseKey.trim().toUpperCase();

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      ok: false,
      error: 'Central licensing server configuration missing: SUPABASE_SERVICE_ROLE_KEY is required.',
    });
  }

  const serverDb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    // 1. Look up license record
    let license = null;
    try {
      const { data, error: fetchErr } = await serverDb
        .from('school_licenses')
        .select('*')
        .eq('license_key', cleanKey)
        .maybeSingle();

      if (!fetchErr && data) {
        license = data;
      }
    } catch {}

    // Resilient fallback query from courses table
    if (!license) {
      try {
        const { data: courseRow } = await serverDb
          .from('courses')
          .select('*')
          .eq('code', 'LIC:' + cleanKey)
          .maybeSingle();

        if (courseRow && courseRow.description) {
          try {
            license = JSON.parse(courseRow.description);
          } catch {
            license = {
              id: courseRow.id,
              license_key: cleanKey,
              school_name: courseRow.name,
              status: courseRow.is_active ? 'licensed' : 'suspended',
              is_activated: true,
            };
          }
        }
      } catch (cErr) {
        console.error('Fallback query error in activate:', cErr);
      }
    }

    if (!license) {
      return res.status(404).json({
        ok: false,
        error: 'Invalid license key. Please check the key provided by your developer or contact support.',
      });
    }

    const now = new Date();
    const defaultContact = {
      name: 'Dhruv Shah',
      email: 'dushah2007@gmail.com',
      phone: '+91 8866039007',
      whatsapp: '+91 8866039007',
    };
    const developerContact = license.contact_developer || defaultContact;

    // 2. Check if suspended
    if (license.status === 'suspended') {
      return res.status(403).json({
        ok: false,
        status: 'suspended',
        error: 'This school license has been suspended. Please contact the developer to resolve.',
        developerContact,
      });
    }

    // 3. First-time Activation: Start authoritative 30-day trial
    const boundId = license.bound_device_id || license.activated_device_id;
    if (!license.is_activated || !boundId) {
      const trialDurationDays = license.days_remaining !== undefined ? license.days_remaining : 30;
      const trialEnds = license.trial_ends_at ? new Date(license.trial_ends_at) : new Date(now.getTime() + trialDurationDays * 24 * 60 * 60 * 1000);

      const updatePayload = {
        is_activated: true,
        trial_started_at: license.trial_started_at || now.toISOString(),
        trial_ends_at: trialEnds.toISOString(),
        status: license.status === 'licensed' ? 'licensed' : 'trial_active',
        activated_device_id: deviceId || 'primary-device',
        bound_device_id: deviceId || 'primary-device',
        last_validated_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      try {
        await serverDb
          .from('school_licenses')
          .update(updatePayload)
          .eq('id', license.id);
      } catch {}

      // Also persist to courses table description if courses fallback
      try {
        const { data: courseRow } = await serverDb
          .from('courses')
          .select('*')
          .eq('code', 'LIC:' + cleanKey)
          .maybeSingle();

        if (courseRow) {
          let descObj = {};
          try { descObj = JSON.parse(courseRow.description) || {}; } catch {}
          Object.assign(descObj, updatePayload);
          await serverDb.from('courses').update({
            description: JSON.stringify(descObj),
            updated_at: now.toISOString(),
          }).eq('code', 'LIC:' + cleanKey);
        }
      } catch {}

      return res.status(200).json({
        ok: true,
        message: 'License activated and bound to this workstation successfully!',
        licenseId: license.id,
        schoolName: license.school_name,
        status: license.status === 'licensed' ? 'licensed' : 'trial_active',
        trialStartedAt: updatePayload.trial_started_at,
        trialEndsAt: updatePayload.trial_ends_at,
        daysRemaining: trialDurationDays,
        boundDeviceId: deviceId || 'primary-device',
        serverTime: now.toISOString(),
        databaseConfig: {
          supabaseUrl: license.school_supabase_url,
          supabaseAnonKey: license.school_supabase_anon_key,
        },
        developerContact,
      });
    }

    // 4. Single-Device Binding Enforcement: Reject activation if entered on a different machine
    if (boundId && deviceId && boundId !== deviceId) {
      return res.status(403).json({
        ok: false,
        status: 'device_mismatch',
        error: `Single-Device License Policy: This license key is already bound to another workstation (${boundId}). It cannot be used on this computer. Contact developer (+91 8866039007) for license transfer or device authorization.`,
        developerContact,
      });
    }

    // 5. Re-activation / Status Check for already-activated license
    const trialEnds = license.trial_ends_at ? new Date(license.trial_ends_at) : null;
    const isExpired = license.status === 'trial_expired' || (trialEnds && now > trialEnds);

    if (isExpired && license.status !== 'licensed') {
      // Ensure status is stored as expired
      if (license.status !== 'trial_expired') {
        await serverDb
          .from('school_licenses')
          .update({ status: 'trial_expired', updated_at: now.toISOString() })
          .eq('id', license.id);
      }

      return res.status(403).json({
        ok: false,
        status: 'trial_expired',
        error: 'Your 30-day trial has expired. Contact the developer to activate SMS.',
        schoolName: license.school_name,
        trialEndsAt: license.trial_ends_at,
        developerContact,
        databaseConfig: {
          supabaseUrl: license.school_supabase_url,
          supabaseAnonKey: license.school_supabase_anon_key,
        },
      });
    }

    // Active license (either active trial or licensed)
    const daysRemaining = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 9999;

    await serverDb
      .from('school_licenses')
      .update({ last_validated_at: now.toISOString() })
      .eq('id', license.id);

    return res.status(200).json({
      ok: true,
      message: 'License is active.',
      licenseId: license.id,
      schoolName: license.school_name,
      status: license.status,
      trialStartedAt: license.trial_started_at,
      trialEndsAt: license.trial_ends_at,
      daysRemaining,
      serverTime: now.toISOString(),
      databaseConfig: {
        supabaseUrl: license.school_supabase_url,
        supabaseAnonKey: license.school_supabase_anon_key,
      },
      developerContact,
    });
  } catch (err) {
    console.error('Fatal activation error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error while activating license.' });
  }
}
