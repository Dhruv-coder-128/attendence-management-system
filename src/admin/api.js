// Talks to /api/license-manage. The developer secret lives only in this tab's sessionStorage.
const SECRET_KEY = 'sms_admin_secret';

export const getSecret = () => {
  try { return sessionStorage.getItem(SECRET_KEY) || ''; } catch { return ''; }
};
export const setSecret = (v) => {
  try {
    if (v) sessionStorage.setItem(SECRET_KEY, v);
    else sessionStorage.removeItem(SECRET_KEY);
  } catch { /* storage blocked: the secret then only lasts until reload */ }
};

async function call(path, body) {
  try {
    const res = await fetch(`/api/license-manage${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'x-developer-secret': getSecret() },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({ ok: false, error: `Server returned HTTP ${res.status}` }));
    return { ...data, httpStatus: res.status };
  } catch (err) {
    return { ok: false, error: 'Cannot reach the server. Check your internet connection.', httpStatus: 0, cause: String(err) };
  }
}

export const listSchools = () => call('');
export const listAudit = (licenseKey, limit = 200) =>
  call(`?view=audit&limit=${limit}${licenseKey ? `&licenseKey=${encodeURIComponent(licenseKey)}` : ''}`);
export const createSchool = (school) => call('', { action: 'create', school });
export const updateSchool = (licenseKey, school) => call('', { action: 'update', licenseKey, school });
export const setDays = (licenseKey, days, exact = false) => call('', { action: 'set_days', licenseKey, days, exact });
export const setLock = (licenseKey, locked) => call('', { action: 'set_lock', licenseKey, locked });
export const setTimer = (licenseKey, visible) => call('', { action: 'set_timer', licenseKey, visible });
export const setTier = (licenseKey, maxStudents) => call('', { action: 'set_tier', licenseKey, maxStudents });
export const resetDevice = (licenseKey) => call('', { action: 'reset_device', licenseKey });
export const deleteSchool = (licenseKey) => call('', { action: 'delete', licenseKey });
