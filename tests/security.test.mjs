// Regression tests for the security fixes: each test fails if the hole comes back.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- helpers ----------
function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}
const req = (over = {}) => ({ method: 'POST', headers: {}, body: {}, socket: { remoteAddress: '10.0.0.9' }, ...over });

/** In-memory stand-in for the few supabase-js calls the license endpoints make. */
function fakeDb(rows) {
  return {
    rows,
    from() {
      const q = { filters: [], patch: null };
      const match = () => rows.filter((r) => q.filters.every(([k, v]) => r[k] === v));
      const api = {
        select: () => api,
        eq: (k, v) => { q.filters.push([k, v]); return api; },
        update: (p) => { q.patch = p; return api; },
        order: () => Promise.resolve({ data: rows, error: null }),
        maybeSingle: () => Promise.resolve({ data: match()[0] || null, error: null }),
        single: () => {
          const r = match()[0];
          if (q.patch) Object.assign(r, q.patch);
          return Promise.resolve({ data: r, error: null });
        },
      };
      return api;
    },
  };
}

// ---------- local password hashing ----------
test('local passwords: correct password verifies, wrong one does not, hashes are salted', async () => {
  const { hashPassword, verifyPassword } = await import('../src/lib/localPassword.js');
  const h1 = await hashPassword('s3cret-pass');
  const h2 = await hashPassword('s3cret-pass');
  assert.notEqual(h1, h2, 'same password must produce different salted hashes');
  assert.equal(await verifyPassword('s3cret-pass', h1), true);
  assert.equal(await verifyPassword('wrong', h1), false);
  assert.equal(await verifyPassword('anything', undefined), false, 'account without a hash must never verify');
});

// ---------- license view rules ----------
test('license: expiry, lock and per-device grants are computed on the server', async () => {
  const { licenseView } = await import('../api/_lib/license.js');
  const now = Date.parse('2026-11-16T00:00:00Z');
  const base = { id: 'L', license_key: 'K', kind: 'school', status: 'trial_active', is_locked: false, max_students: 200 };
  assert.equal(licenseView({ ...base, trial_ends_at: '2026-11-20T00:00:00Z' }, 'D', now).status, 'trial_active');
  assert.equal(licenseView({ ...base, trial_ends_at: '2026-11-10T00:00:00Z' }, 'D', now).status, 'trial_expired');
  assert.equal(licenseView({ ...base, status: 'licensed', trial_ends_at: null }, 'D', now).daysRemaining, 9999);
  assert.equal(licenseView({ ...base, is_locked: true, status: 'licensed' }, 'D', now).ok, false);
  const grace = { ...base, kind: 'grace', device_grants: { D1: { granted_at: '2026-11-01', trial_ends_at: '2026-11-06T00:00:00Z' } } };
  assert.equal(licenseView(grace, 'D1', now).status, 'trial_expired', 'grace key must not renew itself');
});

test('license-activate: rejects missing deviceId (binding bypass) and a second device', async () => {
  globalThis.__smsTestDb = fakeDb([{ id: 'L1', license_key: 'SMS-ABC', kind: 'school', status: 'trial_active', is_locked: false, bound_device_id: 'PC-1', trial_ends_at: '2099-01-01T00:00:00Z' }]);
  const { default: activate } = await import('../api/license-activate.js');

  let res = fakeRes();
  await activate(req({ body: { licenseKey: 'SMS-ABC' }, socket: { remoteAddress: '1.1.1.1' } }), res);
  assert.equal(res.statusCode, 400, 'empty deviceId must be refused');

  res = fakeRes();
  await activate(req({ body: { licenseKey: 'SMS-ABC', deviceId: 'PC-2' }, socket: { remoteAddress: '1.1.1.2' } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.status, 'device_mismatch');

  res = fakeRes();
  await activate(req({ body: { licenseKey: 'SMS-ABC', deviceId: 'PC-1' }, socket: { remoteAddress: '1.1.1.3' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  delete globalThis.__smsTestDb;
});

// ---------- developer-only endpoint ----------
test('license-manage: old PIN and public email are not accepted; secret is required', async () => {
  const { default: manage } = await import('../api/license-manage.js');
  delete process.env.DEVELOPER_SECRET;
  let res = fakeRes();
  await manage(req({ method: 'GET', headers: { 'x-developer-secret': 'anything' } }), res);
  assert.equal(res.statusCode, 500, 'must refuse to run without a configured secret');

  process.env.DEVELOPER_SECRET = 'a-long-random-developer-secret';
  for (const guess of ['8866', 'dushah2007@gmail.com', '']) {
    res = fakeRes();
    await manage(req({ method: 'GET', headers: { 'x-developer-pin': '8866', 'x-developer-secret': guess }, socket: { remoteAddress: '2.2.2.' + guess.length } }), res);
    assert.equal(res.statusCode, 401, `guess "${guess}" must be rejected`);
  }
});

// ---------- parent portal ----------
test('parent portal: forged session token cannot read a child\'s data', async () => {
  globalThis.__smsTestDb = fakeDb([]);
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot';
  process.env.PARENT_SESSION_SECRET = 'x'.repeat(40);
  const { default: parentAuth } = await import('../api/parent-portal-auth.js');
  const forged = Buffer.from(JSON.stringify({ pid: 'p', sids: ['kid-1'], exp: Date.now() + 1e9 })).toString('base64url') + '.fake';
  const res = fakeRes();
  await parentAuth(req({ body: { action: 'portal_data', sessionToken: forged, studentId: 'kid-1' }, socket: { remoteAddress: '3.3.3.3' } }), res);
  assert.equal(res.statusCode, 401);
});

test('parent portal: login code requires the child identifier, not just a phone number', async () => {
  const { default: parentAuth } = await import('../api/parent-portal-auth.js');
  const res = fakeRes();
  await parentAuth(req({ body: { action: 'request_otp', phone: '9876543210' }, socket: { remoteAddress: '3.3.3.4' } }), res);
  assert.equal(res.statusCode, 400);
  delete globalThis.__smsTestDb;
});

// ---------- dev Wi-Fi hub ----------
test('dev hub: never runs on Vercel; LAN callers get no token/OTP and no data without pairing', async () => {
  const { default: hub } = await import('../api/local-hub.js');

  process.env.VERCEL = '1';
  let res = fakeRes();
  await hub(req({ method: 'GET', query: { action: 'export_school_data' } }), res);
  assert.equal(res.statusCode, 404);
  delete process.env.VERCEL;

  res = fakeRes();
  await hub(req({ method: 'GET', query: { action: 'status' } }), res);
  assert.equal(res.body.token, null, 'status must not leak the token to the LAN');
  assert.equal(res.body.otp, null, 'status must not leak the pairing code to the LAN');

  res = fakeRes();
  await hub(req({ method: 'GET', query: { action: 'students', batch_id: 'B11' } }), res);
  assert.equal(res.statusCode, 401);

  res = fakeRes();
  await hub(req({ method: 'GET', query: { action: 'status' }, socket: { remoteAddress: '127.0.0.1' } }), res);
  assert.match(res.body.token, /^[0-9a-f]{32}$/, 'the PC itself gets a random token');
});
