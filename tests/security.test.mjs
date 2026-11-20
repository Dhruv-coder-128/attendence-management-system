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
