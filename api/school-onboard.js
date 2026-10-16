/**
 * SMS — Student Management System
 * Serverless API: /api/school-onboard
 * Privileged Developer Endpoint: Registers a new school, maps their individual
 * Supabase database (URL & publishable anon key), and issues a unique 30-day trial License Key.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  // Authorize caller: Must be System Owner (dushah2007@gmail.com) or provide valid DEVELOPER_SECRET
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const devSecretHeader = req.headers['x-developer-secret'] || '';

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const developerSecret = process.env.DEVELOPER_SECRET || process.env.OWNER_EMAIL || 'dushah2007@gmail.com';

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      ok: false,
      error: 'Central licensing server configuration missing: SUPABASE_SERVICE_ROLE_KEY is required.',
    });
  }

  const serverDb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let isAuthorized = false;

  // Option A: Direct Developer Secret Match
  if (devSecretHeader && devSecretHeader === developerSecret) {
    isAuthorized = true;
  }

  // Option B: Supabase Auth Token verification for dushah2007@gmail.com
  if (!isAuthorized && token) {
    try {
      const { data: { user } } = await serverDb.auth.getUser(token);
      if (user && user.email?.trim().toLowerCase() === (process.env.OWNER_EMAIL || 'dushah2007@gmail.com').toLowerCase()) {
        isAuthorized = true;
      }
    } catch {}
  }

  if (!isAuthorized) {
    return res.status(403).json({
      ok: false,
      error: 'Access Denied: Only the system developer / primary owner can onboard new school databases.',
    });
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

  const defaultContact = {
    name: 'Dhruv Shah',
    email: 'dushah2007@gmail.com',
    phone: '+91 8866039007',
    whatsapp: '+91 8866039007',
  };

  const payload = {
    id: schoolId,
    school_name: schoolName.trim(),
    license_key: licenseKey,
    school_supabase_url: cleanUrl,
    school_supabase_anon_key: cleanAnonKey,
    is_activated: false,
    trial_started_at: null,
    trial_ends_at: null,
    status: 'pending',
    contact_developer: contactDeveloper || defaultContact,
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
