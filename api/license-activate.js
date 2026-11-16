/**
 * POST /api/license-activate  { licenseKey, deviceId }
 * Binds a school key to one device, or grants a universal trial / grace key once per device.
 * Licenses live only in public.school_licenses (service role only).
 */
import {
  applyCors, rateLimited, clientIp, getServerDb, findLicense, updateLicense, licenseView,
  readLicenseRequest, addDays, TRIAL_DAYS, STATUS_ERRORS, DEVELOPER_CONTACT,
} from './_lib/license.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  if (rateLimited('activate:' + clientIp(req), 10, 10 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Too many activation attempts. Please wait 10 minutes.' });
  }

  const { key, deviceId, error: inputError } = readLicenseRequest(req.body);
  if (inputError) return res.status(400).json({ ok: false, error: inputError });

  const db = getServerDb();
  if (!db) return res.status(500).json({ ok: false, error: 'Licensing server is not configured.' });

  try {
    let row = await findLicense(db, key);
    if (!row) {
      return res.status(404).json({
        ok: false,
        error: 'Invalid license key. Please check the key provided by your developer.',
        developerContact: DEVELOPER_CONTACT,
      });
    }

    const now = Date.now();
    if (row.kind === 'school') {
      if (row.bound_device_id && row.bound_device_id !== deviceId) {
        return res.status(403).json({ ok: false, status: 'device_mismatch', error: STATUS_ERRORS.device_mismatch, developerContact: DEVELOPER_CONTACT });
      }
      if (!row.bound_device_id) {
        row = await updateLicense(db, row.id, {
          bound_device_id: deviceId,
          activated_device_id: deviceId,
          is_activated: true,
          trial_started_at: row.trial_started_at || new Date(now).toISOString(),
          // A paid 'licensed' key with no end date is lifetime; an unpaid key gets the standard trial.
          trial_ends_at: row.trial_ends_at || (row.status === 'licensed' ? null : addDays(TRIAL_DAYS.school, now)),
        });
      }
    } else if (!row.device_grants?.[deviceId]) {
      // Universal trial / grace: one grant per device, never renewed by re-entering the key.
      const grants = {
        ...(row.device_grants || {}),
        [deviceId]: { granted_at: new Date(now).toISOString(), trial_ends_at: addDays(TRIAL_DAYS[row.kind] || 5, now) },
      };
      row = await updateLicense(db, row.id, { device_grants: grants });
    }

    const view = licenseView(row, deviceId, now);
    await updateLicense(db, row.id, { last_validated_at: new Date(now).toISOString() });
    if (!view.ok) return res.status(403).json({ ...view, error: STATUS_ERRORS[view.status] });
    return res.status(200).json({ ...view, message: 'License activated on this computer.' });
  } catch (err) {
    console.error('license-activate error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error while activating license.' });
  }
}
