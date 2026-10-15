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
    let query = serverDb.from('school_licenses').select('*');
    if (licenseKey) {
      query = query.eq('license_key', String(licenseKey).trim().toUpperCase());
    } else {
      query = query.eq('id', String(licenseId).trim());
    }

    const { data: license, error: fetchErr } = await query.maybeSingle();

    if (fetchErr) {
      console.error('License fetch error:', fetchErr);
      return res.status(500).json({ ok: false, error: 'Failed to query licensing registry.' });
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
      phone: '+91 98765 43210',
      whatsapp: '+91 98765 43210',
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
        error: 'This school license has been suspended. Please contact the developer to resolve.',
        developerContact,
      });
    }

    // Check Expiration against Authoritative Server Time
    const trialEnds = license.trial_ends_at ? new Date(license.trial_ends_at) : null;
    const isExpired = (license.status === 'trial_expired') || (license.status !== 'licensed' && trialEnds && now > trialEnds);

    if (isExpired) {
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
      });
    }

    // License is active (either within 30-day trial or permanent 'licensed')
    const daysRemaining = trialEnds
      ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 9999;

    // Record heartbeat
    await serverDb
      .from('school_licenses')
      .update({ last_validated_at: now.toISOString() })
      .eq('id', license.id);

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
