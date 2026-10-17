/**
 * SMS — Student Management System
 * Serverless API: /api/license-validate
 * Periodically and at startup validates school license, enforces server-controlled 30-day trial expiry,
 * and guards against local client clock tampering.
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

  const { licenseKey, licenseId } = req.body || {};

  if (!licenseKey && !licenseId) {
    return res.status(400).json({ ok: false, error: 'License key or license ID is required for validation.' });
  }

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
    let license = null;
    const cleanKey = licenseKey ? String(licenseKey).trim().toUpperCase() : null;
    const cleanId = licenseId ? String(licenseId).trim() : null;

    // 1. Try querying school_licenses table
    try {
      let query = serverDb.from('school_licenses').select('*');
      if (cleanKey) {
        query = query.eq('license_key', cleanKey);
      } else {
        query = query.eq('id', cleanId);
      }
      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        license = data;
      }
    } catch (e) {
      console.warn('Licensing primary store query error:', e.message);
    }

    // 2. Resilient fallback query from courses table
    if (!license && cleanKey) {
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
        console.error('Fallback query error from courses:', cErr);
      }
    }

    if (!license) {
      return res.status(404).json({
        ok: false,
        status: 'invalid',
        error: 'License record not found in system registry. Please contact developer.',
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

    if (!license.is_activated) {
      return res.status(400).json({
        ok: false,
        status: 'not_activated',
        error: 'This school license has not been activated yet. Please activate to start your 30-day trial.',
        developerContact,
      });
    }

    if (license.status === 'suspended') {
      return res.status(403).json({
        ok: false,
        status: 'suspended',
        error: 'This school license has been suspended by the developer. Contact developer to resolve.',
        developerContact,
      });
    }

    // Check Expiration against Authoritative Server Time
    const trialEnds = license.trial_ends_at ? new Date(license.trial_ends_at) : null;
    const isExpired = (license.status === 'trial_expired') || (license.status !== 'licensed' && trialEnds && now > trialEnds);

    if (isExpired) {
      if (license.status !== 'trial_expired') {
        try {
          await serverDb
            .from('school_licenses')
            .update({ status: 'trial_expired', updated_at: now.toISOString() })
            .eq('id', license.id);
        } catch {}
        if (cleanKey) {
          try {
            const updatedPayload = { ...license, status: 'trial_expired', updated_at: now.toISOString() };
            await serverDb.from('courses').update({
              is_active: false,
              description: JSON.stringify(updatedPayload),
              name: `${license.school_name || 'SMS Academy'} [TRIAL_EXPIRED]`,
              updated_at: now.toISOString(),
            }).eq('code', 'LIC:' + cleanKey);
          } catch {}
        }
      }

      return res.status(403).json({
        ok: false,
        status: 'trial_expired',
        error: 'Your 30-day trial has expired. Contact the developer to activate SMS.',
        schoolName: license.school_name,
        trialEndsAt: license.trial_ends_at,
        developerContact,
      });
    }

    // License is active (either within 30-day trial or permanent 'licensed')
    const daysRemaining = trialEnds
      ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 9999;

    // Record heartbeat
    try {
      await serverDb
        .from('school_licenses')
        .update({ last_validated_at: now.toISOString() })
        .eq('id', license.id);
    } catch {}

    return res.status(200).json({
      ok: true,
      licenseId: license.id,
      schoolName: license.school_name,
      status: license.status,
      trialStartedAt: license.trial_started_at,
      trialEndsAt: license.trial_ends_at,
      daysRemaining,
      serverTime: now.toISOString(),
      gracePeriodHours: license.grace_period_hours || 24,
      databaseConfig: {
        supabaseUrl: license.school_supabase_url,
        supabaseAnonKey: license.school_supabase_anon_key,
      },
      developerContact,
    });
  } catch (err) {
    console.error('Validation error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error while validating license.' });
  }
}
