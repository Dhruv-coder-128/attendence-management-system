/**
 * /api/license-manage — developer-only license administration.
 * Auth: header `x-developer-secret` must equal env DEVELOPER_SECRET (min 16 chars).
 * GET  → list all licenses
 * POST { action, licenseKey, ... } → upsert | set_days | set_lock | set_timer | set_tier | reset_device | delete
 */
import {
  applyCors, rateLimited, overLimit, clientIp, safeEqual, getServerDb, findLicense, updateLicense,
  cleanKey, daysLeft, addDays,
} from './_lib/license.js';

function toClient(row) {
  const daysRemaining = row.kind === 'school' ? daysLeft(row.trial_ends_at) : 9999;
  const expired = row.trial_ends_at && daysRemaining === 0;
  return {
    id: row.id,
    kind: row.kind,
    schoolName: row.school_name,
    contactPerson: row.contact_person || '',
    email: row.email || '',
    phone: row.phone || '',
    licenseKey: row.license_key,
    status: row.is_locked ? 'suspended' : expired ? 'trial_expired' : row.status,
    isLocked: Boolean(row.is_locked),
    isTimerVisible: row.is_timer_visible !== false,
    daysRemaining,
    maxStudents: row.max_students || 200,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    boundDeviceId: row.bound_device_id || null,
    deviceGrantCount: Object.keys(row.device_grants || {}).length,
    notes: row.notes || '',
    createdAt: row.created_at,
  };
}

// days: 9999 means lifetime (no end date).
function daysPatch(row, days, exact) {
  if (days >= 9000) return { status: 'licensed', trial_ends_at: null };
  const base = exact ? Date.now() : Math.max(Date.now(), row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : Date.now());
  return { trial_ends_at: addDays(Math.max(exact ? 0 : -36500, days), base) };
}

export default async function handler(req, res) {
  if (applyCors(req, res, 'GET, POST, OPTIONS', 'Content-Type, x-developer-secret')) return;

  const secret = process.env.DEVELOPER_SECRET;
  if (!secret || secret.length < 16) {
    return res.status(500).json({ ok: false, error: 'DEVELOPER_SECRET is not configured on the server (min 16 characters).' });
  }
  const failKey = 'manage-fail:' + clientIp(req);
  const FAIL_WINDOW = 15 * 60 * 1000;
  if (overLimit(failKey, 10, FAIL_WINDOW)) {
    return res.status(429).json({ ok: false, error: 'Too many failed attempts. Try again in 15 minutes.' });
  }
  if (!safeEqual(req.headers['x-developer-secret'], secret)) {
    rateLimited(failKey, 10, FAIL_WINDOW);
    return res.status(401).json({ ok: false, error: 'Invalid developer secret.' });
  }

  const db = getServerDb();
  if (!db) return res.status(500).json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await db.from('school_licenses').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ ok: true, licenses: data.map(toClient) });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

    const body = req.body || {};
    const key = cleanKey(body.licenseKey || body.license?.licenseKey);
    if (!key) return res.status(400).json({ ok: false, error: 'licenseKey is required.' });

    if (body.action === 'upsert') {
      const l = body.license || {};
      const existing = await findLicense(db, key);
      const days = Number(l.daysRemaining);
      const record = {
        license_key: key,
        school_name: String(l.schoolName || 'SMS Client School').trim(),
        contact_person: l.contactPerson || '',
        email: l.email || '',
        phone: l.phone || '',
        notes: l.notes || '',
        max_students: parseInt(l.maxStudents, 10) || 200,
        is_timer_visible: l.isTimerVisible !== false,
        status: l.status === 'licensed' || days >= 9000 ? 'licensed' : 'trial_active',
        updated_at: new Date().toISOString(),
        ...(Number.isFinite(days) ? daysPatch(existing || {}, days, true) : {}),
      };
      const { data, error } = existing
        ? await db.from('school_licenses').update(record).eq('id', existing.id).select().single()
        : await db.from('school_licenses').insert({ id: `LIC-${key}`, kind: 'school', trial_started_at: new Date().toISOString(), ...record }).select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, license: toClient(data) });
    }

    const row = await findLicense(db, key);
    if (!row) return res.status(404).json({ ok: false, error: 'License not found.' });

    const patches = {
      set_days: () => daysPatch(row, parseInt(body.days, 10) || 0, Boolean(body.exact)),
      set_lock: () => ({ is_locked: Boolean(body.locked) }),
      set_timer: () => ({ is_timer_visible: Boolean(body.visible) }),
      set_tier: () => ({ max_students: parseInt(body.maxStudents, 10) || 200 }),
      reset_device: () => ({ bound_device_id: null, activated_device_id: null, is_activated: false, device_grants: row.kind === 'school' ? row.device_grants : {} }),
    };

    if (body.action === 'delete') {
      const { error } = await db.from('school_licenses').delete().eq('id', row.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    if (!patches[body.action]) return res.status(400).json({ ok: false, error: `Unknown action: ${body.action}` });

    const updated = await updateLicense(db, row.id, patches[body.action]());
    return res.status(200).json({ ok: true, license: toClient(updated) });
  } catch (err) {
    console.error('license-manage error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error.' });
  }
}
