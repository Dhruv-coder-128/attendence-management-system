/**
 * Admin SaaS service - wraps license-manage API with hashed PIN auth + audit.
 * No hardcoded PIN/email/keys - all from runtime or user input.
 */
import { getApiBaseUrl } from './licenseService.js';

function getAdminHeaders(pin) {
  const h = { 'Content-Type': 'application/json' };
  if (pin) h['x-admin-pin'] = pin;
  const token = localStorage.getItem('sms_admin_token');
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

export async function adminFetchLicenses(pin) {
  const base = getApiBaseUrl();
  const res = await fetch((base || '') + '/api/license-manage', { headers: getAdminHeaders(pin) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch licenses');
  return data.licenses || [];
}

export async function adminCreateLicense(pin, payload) {
  const base = getApiBaseUrl();
  const res = await fetch((base || '') + '/api/license-manage', {
    method: 'POST',
    headers: getAdminHeaders(pin),
    body: JSON.stringify({ action: 'upsert', license: payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Create failed');
  return data.license;
}

export async function adminSuspend(pin, licenseKey) {
  const base = getApiBaseUrl();
  const res = await fetch((base || '') + '/api/license-manage', {
    method: 'POST', headers: getAdminHeaders(pin),
    body: JSON.stringify({ action: 'suspend', licenseKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function adminUnlock(pin, licenseKey) {
  const base = getApiBaseUrl();
  const res = await fetch((base || '') + '/api/license-manage', {
    method: 'POST', headers: getAdminHeaders(pin),
    body: JSON.stringify({ action: 'unlock', licenseKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function adminSetDays(pin, licenseKey, days) {
  const base = getApiBaseUrl();
  const res = await fetch((base || '') + '/api/license-manage', {
    method: 'POST', headers: getAdminHeaders(pin),
    body: JSON.stringify({ action: 'set_days', licenseKey, durationDays: days }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function adminAdjustDays(pin, licenseKey, delta, currentDays) {
  const base = getApiBaseUrl();
  const res = await fetch((base || '') + '/api/license-manage', {
    method: 'POST', headers: getAdminHeaders(pin),
    body: JSON.stringify({ action: 'adjust_days', licenseKey, deltaDays: delta, currentDays }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function adminToggleTimer(pin, licenseKey, isTimerVisible) {
  const base = getApiBaseUrl();
  const res = await fetch((base || '') + '/api/license-manage', {
    method: 'POST', headers: getAdminHeaders(pin),
    body: JSON.stringify({ action: 'toggle_timer', licenseKey, isTimerVisible }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function adminResetDevice(pin, licenseKey) {
  const base = getApiBaseUrl();
  const res = await fetch((base || '') + '/api/license-manage', {
    method: 'POST', headers: getAdminHeaders(pin),
    body: JSON.stringify({ action: 'reset_device', licenseKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function adminDelete(pin, licenseKey) {
  const base = getApiBaseUrl();
  const res = await fetch((base || '') + '/api/license-manage', {
    method: 'POST', headers: getAdminHeaders(pin),
    body: JSON.stringify({ action: 'delete', licenseKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function adminFetchAudits(pin, licenseKey) {
  const base = getApiBaseUrl();
  const res = await fetch((base || '') + '/api/license-manage', {
    method: 'POST', headers: getAdminHeaders(pin),
    body: JSON.stringify({ action: 'list_audit', licenseKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.audits || [];
}
