/**
 * /api/license-manage — developer-only school & license administration (used by the /admin panel).
 * Auth: header `x-developer-secret` must equal env DEVELOPER_SECRET (min 16 chars).
 *
 * GET                       → { licenses }
 * GET ?view=audit[&licenseKey=&limit=] → { audit }
 * POST { action, ... }
 *   create       { school: { schoolName, contactPerson, email, phone, notes, type, days, maxStudents } } → new key generated here
 *   update       { licenseKey, school: { schoolName, contactPerson, email, phone, notes, type, maxStudents } }
 *   set_days     { licenseKey, days, exact }   exact → now + days; otherwise add days (negative allowed). days >= 9000 = lifetime
 *   set_lock     { licenseKey, locked }
 *   set_timer    { licenseKey, visible }
 *   set_tier     { licenseKey, maxStudents }
 *   reset_device { licenseKey }                frees the key to be activated on a new computer
 *   delete       { licenseKey }
 * Every change writes a row to license_audit_log.
 */
import crypto from 'node:crypto';
import {
  applyCors, rateLimited, overLimit, clientIp, safeEqual, getServerDb, findLicense, updateLicense,
  cleanKey, daysLeft, addDays,
} from './_lib/license.js';

const LIFETIME_DAYS = 9000;

function toClient(row) {
  const daysRemaining = row.kind === 'school' ? daysLeft(row.trial_ends_at) : 9999;
  const expired = Boolean(row.trial_ends_at) && daysRemaining === 0;
  return {
    id: row.id,
    kind: row.kind,
    schoolName: row.school_name,
    contactPerson: row.contact_person || '',
    email: row.email || '',
    phone: row.phone || '',
    licenseKey: row.license_key,
    type: row.status === 'licensed' ? 'paid' : 'trial',
    status: row.is_locked ? 'suspended' : expired ? 'trial_expired' : row.status,
    isLocked: Boolean(row.is_locked),
    isTimerVisible: row.is_timer_visible !== false,
    daysRemaining,
    isLifetime: row.status === 'licensed' && !row.trial_ends_at,
    maxStudents: row.max_students || 200,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    boundDeviceId: row.bound_device_id || null,
    deviceGrantCount: Object.keys(row.device_grants || {}).length,
    lastSeenAt: row.last_validated_at || null,
    notes: row.notes || '',
    createdAt: row.created_at,
  };
}

class InputError extends Error {}

/** Validates and normalises the editable school fields. `partial` allows omitted fields (update). */
function readSchoolFields(input = {}, partial) {
  const out = {};
  const text = (v, max, label) => {
    const s = String(v ?? '').trim();
    if (s.length > max) throw new InputError(`${label} is too long (max ${max} characters).`);
    return s;
  };
  if (!partial || input.schoolName !== undefined) {
    out.school_name = text(input.schoolName, 120, 'School name');
    if (!out.school_name) throw new InputError('School name is required.');
  }
  if (input.contactPerson !== undefined) out.contact_person = text(input.contactPerson, 120, 'Contact person');
  if (input.email !== undefined) {
    out.email = text(input.email, 160, 'Email');
    if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new InputError('Email address is not valid.');
  }
  if (input.phone !== undefined) out.phone = text(input.phone, 40, 'Phone');
  if (input.notes !== undefined) out.notes = text(input.notes, 1000, 'Notes');
  if (input.maxStudents !== undefined) {
    const n = Number(input.maxStudents);
    if (!Number.isInteger(n) || n < 1 || n > 100000) throw new InputError('Student limit must be a whole number from 1 to 100000.');
    out.max_students = n;
  }
  if (input.type !== undefined) {
    if (!['trial', 'paid'].includes(input.type)) throw new InputError('Type must be "trial" or "paid".');
    out.status = input.type === 'paid' ? 'licensed' : 'trial_active';
  }
  return out;
}

function readDays(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < -36500 || n > 9999) throw new InputError('Days must be a whole number (9000 or more = lifetime).');
  return n;
}

/** Expiry patch. days >= 9000 → lifetime paid licence (no end date). */
function daysPatch(row, days, exact) {
  if (days >= LIFETIME_DAYS) return { status: 'licensed', trial_ends_at: null };
  if (!exact && row.status === 'licensed' && !row.trial_ends_at) throw new InputError('This licence is lifetime. Set an exact number of days to change it.');
  const current = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : Date.now();
  const base = exact ? Date.now() : Math.max(Date.now(), current);
  return { trial_ends_at: addDays(exact ? Math.max(0, days) : days, base) };
}

function newLicenseKey(schoolName) {
  const slug = schoolName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'SCHOOL';
  return `SMS-${slug}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function audit(db, req, action, row, details = {}) {
  const { error } = await db.from('license_audit_log').insert({
    action,
    license_key: row?.license_key || null,
    school_name: row?.school_name || null,
    details,
    ip: clientIp(req),
  });
  // The change itself already succeeded; never fail the request because the log write failed.
  if (error) console.error('audit log write failed:', error.message);
}

async function createSchool(db, req, body) {
  const fields = readSchoolFields(body.school, false);
  const days = readDays(body.school?.days ?? 30);
  const now = new Date().toISOString();
  let key;
  for (let i = 0; i < 5 && !key; i++) {
    const candidate = newLicenseKey(fields.school_name);
    if (!(await findLicense(db, candidate))) key = candidate;
  }
  if (!key) throw new Error('Could not generate a unique license key. Please try again.');

  const record = {
    id: `LIC-${key}`,
    kind: 'school',
    license_key: key,
    status: 'trial_active',
    max_students: 200,
    is_timer_visible: true,
    trial_started_at: now,
    ...fields,
    ...daysPatch({}, days, true),
  };
  const { data, error } = await db.from('school_licenses').insert(record).select().single();
  if (error) throw error;
  await audit(db, req, 'create', data, { type: data.status, days, maxStudents: data.max_students });
  return data;
}

const ACTIONS = {
  update: {
    patch: (row, body) => {
      const fields = readSchoolFields(body.school, true);
      if (!Object.keys(fields).length) throw new InputError('Nothing to update.');
      return fields;
    },
  },
  set_days: {
    patch: (row, body) => daysPatch(row, readDays(body.days), Boolean(body.exact)),
    note: (body) => ({ days: Number(body.days), exact: Boolean(body.exact) }),
  },
  set_lock: { patch: (row, body) => ({ is_locked: Boolean(body.locked) }), note: (body) => ({ locked: Boolean(body.locked) }) },
  set_timer: { patch: (row, body) => ({ is_timer_visible: Boolean(body.visible) }), note: (body) => ({ visible: Boolean(body.visible) }) },
  set_tier: {
    patch: (row, body) => readSchoolFields({ maxStudents: body.maxStudents }, true),
    note: (body) => ({ maxStudents: Number(body.maxStudents) }),
  },
  reset_device: {
    patch: (row) => ({
      bound_device_id: null,
      activated_device_id: null,
      is_activated: false,
      // Universal trial/grace keys keep their per-device grants so a reset can't hand out a fresh trial.
      device_grants: row.device_grants || {},
    }),
    note: (body, row) => ({ previousDevice: row.bound_device_id || null }),
  },
};

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
      if (req.query?.view === 'audit') {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
        let q = db.from('license_audit_log').select('*');
        if (req.query.licenseKey) q = q.eq('license_key', cleanKey(req.query.licenseKey));
        const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
        if (error) throw error;
        return res.status(200).json({ ok: true, audit: data });
      }
      const { data, error } = await db.from('school_licenses').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ ok: true, licenses: data.map(toClient) });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

    const body = req.body || {};
    if (body.action === 'create') {
      return res.status(201).json({ ok: true, license: toClient(await createSchool(db, req, body)) });
    }

    const row = await findLicense(db, cleanKey(body.licenseKey));
    if (!row) return res.status(404).json({ ok: false, error: 'School / license not found.' });

    if (body.action === 'delete') {
      if (row.kind !== 'school') throw new InputError('The shared trial and grace keys cannot be deleted.');
      const { error } = await db.from('school_licenses').delete().eq('id', row.id);
      if (error) throw error;
      await audit(db, req, 'delete', row, { status: row.status, boundDevice: row.bound_device_id || null });
      return res.status(200).json({ ok: true });
    }

    const handlerDef = ACTIONS[body.action];
    if (!handlerDef) return res.status(400).json({ ok: false, error: `Unknown action: ${body.action}` });
    if (row.kind !== 'school' && ['update', 'set_days', 'set_tier'].includes(body.action)) {
      throw new InputError('The shared trial and grace keys can only be locked or have their device list reset.');
    }

    // Work out the patch and the log details from the row as it is now, before anything changes.
    const patch = handlerDef.patch(row, body);
    const details = handlerDef.note ? handlerDef.note(body, row) : {};
    const updated = await updateLicense(db, row.id, patch);
    await audit(db, req, body.action, updated, details);
    return res.status(200).json({ ok: true, license: toClient(updated) });
  } catch (err) {
    if (err instanceof InputError) return res.status(400).json({ ok: false, error: err.message });
    console.error('license-manage error:', err);
    return res.status(500).json({ ok: false, error: 'Server error. Please try again.' });
  }
}
