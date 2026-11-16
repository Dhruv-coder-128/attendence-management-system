/**
 * SMS — Student Management System
 * Serverless API: /api/school-onboard
 * Privileged Developer Endpoint: Registers a new school, maps their individual
 * Supabase database (URL & publishable anon key), and issues a unique 30-day trial License Key.
 */

import crypto from 'crypto';
import { applyCors, rateLimited, overLimit, clientIp, safeEqual, getServerDb, DEVELOPER_CONTACT } from './_lib/license.js';

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS', 'Content-Type, x-developer-secret')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const secret = process.env.DEVELOPER_SECRET;
  if (!secret || secret.length < 16) {
    return res.status(500).json({ ok: false, error: 'DEVELOPER_SECRET is not configured on the server (min 16 characters).' });
  }
  const failKey = 'onboard-fail:' + clientIp(req);
  if (overLimit(failKey, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Too many failed attempts. Try again in 15 minutes.' });
  }
  if (!safeEqual(req.headers['x-developer-secret'], secret)) {
    rateLimited(failKey, 10, 15 * 60 * 1000);
    return res.status(403).json({ ok: false, error: 'Access Denied: developer secret required.' });
  }

  const serverDb = getServerDb();
  if (!serverDb) {
    return res.status(500).json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' });
  }

  const {
    schoolName,
    schoolSupabaseUrl,
    schoolSupabaseAnonKey,
    contactDeveloper,
    notes = '',
  } = req.body || {};

  if (!schoolName || !schoolSupabaseUrl || !schoolSupabaseAnonKey) {
    return res.status(400).json({
      ok: false,
      error: 'School Name, School Supabase URL, and School Publishable/Anon Key are required.',
    });
  }

  // Validate clean URL
  let cleanUrl = schoolSupabaseUrl.trim().replace(/\/+$/, '');
  if (!cleanUrl.startsWith('https://')) {
    return res.status(400).json({ ok: false, error: 'School Supabase URL must be a valid HTTPS URL.' });
  }

  const cleanAnonKey = schoolSupabaseAnonKey.trim();

  // Generate unique School License ID and activation key
  const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  const randomMiddle = crypto.randomBytes(4).toString('hex').toUpperCase();
  const licenseKey = `SMS-${randomMiddle}-${randomSuffix}`;
  const schoolId = `SMS-SCH-${Date.now().toString(36).toUpperCase()}-${randomSuffix}`;

  const payload = {
    id: schoolId,
    school_name: schoolName.trim(),
    license_key: licenseKey,
    school_supabase_url: cleanUrl,
    school_supabase_anon_key: cleanAnonKey,
    kind: 'school',
    is_activated: false,
    trial_started_at: null,
    trial_ends_at: null,
    status: 'trial_active',
    contact_developer: contactDeveloper || DEVELOPER_CONTACT,
    notes: notes.trim(),
  };

  try {
    const { data: created, error: insertErr } = await serverDb
      .from('school_licenses')
      .insert(payload)
      .select()
      .single();

    if (insertErr) {
      console.error('Error inserting school license:', insertErr);
      return res.status(500).json({ ok: false, error: `Failed to register school: ${insertErr.message}` });
    }

    return res.status(201).json({
      ok: true,
      message: `School "${schoolName}" successfully onboarded! Share this license key with the school administrator.`,
      license: {
        schoolId: created.id,
        schoolName: created.school_name,
        licenseKey: created.license_key,
        status: created.status,
        schoolSupabaseUrl: created.school_supabase_url,
      },
    });
  } catch (err) {
    console.error('Fatal onboarding error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error while onboarding school.' });
  }
}
