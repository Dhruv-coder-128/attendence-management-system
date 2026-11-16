/**
 * POST /api/license-validate  { licenseKey, deviceId }
 * Startup / periodic check. Never grants anything new except binding a legacy unbound school key.
 */
import {
  applyCors, rateLimited, clientIp, getServerDb, findLicense, updateLicense, licenseView,
  readLicenseRequest, STATUS_ERRORS, DEVELOPER_CONTACT,
} from './_lib/license.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  if (rateLimited('validate:' + clientIp(req), 60, 10 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
  }

  const { key, deviceId, error: inputError } = readLicenseRequest(req.body);
  if (inputError) return res.status(400).json({ ok: false, error: inputError });

  const db = getServerDb();
  if (!db) return res.status(500).json({ ok: false, error: 'Licensing server is not configured.' });

  try {
    let row = await findLicense(db, key);
    if (!row) return res.status(404).json({ ok: false, status: 'invalid', error: 'License key not found.', developerContact: DEVELOPER_CONTACT });

    if (row.kind === 'school') {
      if (row.bound_device_id && row.bound_device_id !== deviceId) {
        return res.status(403).json({ ok: false, status: 'hardware_mismatch', error: STATUS_ERRORS.device_mismatch, developerContact: DEVELOPER_CONTACT });
      }
      if (!row.bound_device_id) {
        row = await updateLicense(db, row.id, { bound_device_id: deviceId, activated_device_id: deviceId, is_activated: true });
      }
    } else if (!row.device_grants?.[deviceId]) {
      return res.status(403).json({ ok: false, status: 'unlicensed', error: STATUS_ERRORS.not_activated, developerContact: DEVELOPER_CONTACT });
    }

    const view = licenseView(row, deviceId);
    await updateLicense(db, row.id, { last_validated_at: view.serverTime });
    if (!view.ok) return res.status(403).json({ ...view, error: STATUS_ERRORS[view.status] });
    return res.status(200).json(view);
  } catch (err) {
    console.error('license-validate error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error while validating license.' });
  }
}
