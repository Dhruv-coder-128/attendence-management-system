// Admin panel API: create / update / extend / lock / reset / delete, auth, validation and the audit log.
// Uses an in-memory stand-in for the few supabase-js calls the API makes. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SECRET = 'a-long-random-developer-secret';

/** Minimal in-memory supabase-js: from(table).select/insert/update/delete/eq/order/limit/maybeSingle/single. */
function memoryDb() {
  const tables = { school_licenses: [], license_audit_log: [] };
  let nextId = 1;
  return {
    tables,
    from(name) {
      const rows = tables[name];
      const q = { filters: [], op: 'select', payload: null, desc: false, max: Infinity };
      const matches = () => rows.filter((r) => q.filters.every(([k, v]) => r[k] === v));
      const run = () => {
        if (q.op === 'insert') {
          const row = { created_at: new Date().toISOString(), ...(name === 'license_audit_log' ? { id: nextId++ } : {}), ...q.payload };
          if (name === 'school_licenses' && rows.some((r) => r.license_key === row.license_key)) return { data: null, error: { message: 'duplicate key' } };
          rows.push(row);
          return { data: [row], error: null };
        }
        const hit = matches();
        if (q.op === 'update') { hit.forEach((r) => Object.assign(r, q.payload)); return { data: hit, error: null }; }
        if (q.op === 'delete') { hit.forEach((r) => rows.splice(rows.indexOf(r), 1)); return { data: hit, error: null }; }
        const sorted = [...hit].sort((a, b) => (q.desc ? -1 : 1) * String(a.created_at).localeCompare(String(b.created_at)));
        return { data: sorted.slice(0, q.max), error: null };
      };
      const api = {
        select: () => api,
        insert: (p) => { q.op = 'insert'; q.payload = p; return api; },
        update: (p) => { q.op = 'update'; q.payload = p; return api; },
        delete: () => { q.op = 'delete'; return api; },
        eq: (k, v) => { q.filters.push([k, v]); return api; },
        order: (_c, o) => { q.desc = o?.ascending === false; return api; },
        limit: (n) => { q.max = n; return api; },
        maybeSingle: async () => ({ data: run().data?.[0] || null, error: null }),
        single: async () => { const r = run(); return r.error ? r : { data: r.data[0], error: null }; },
        then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
      };
      return api;
    },
  };
}

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

let db, handler, ipCounter = 0;
const call = async (method, { body, query, secret = SECRET } = {}) => {
  const res = fakeRes();
  await handler({
    method, query: query || {}, body: body || {},
    headers: secret === null ? {} : { 'x-developer-secret': secret },
    socket: { remoteAddress: `9.9.9.${++ipCounter % 250}` },
  }, res);
  return res;
};
const create = (school = {}) => call('POST', { body: { action: 'create', school: { schoolName: 'Noble School', days: 30, maxStudents: 500, ...school } } });

beforeEach(async () => {
  process.env.DEVELOPER_SECRET = SECRET;
  db = memoryDb();
  db.tables.school_licenses.push({ id: 'LIC-SMS-FREE-TRIAL-30D', license_key: 'SMS-FREE-TRIAL-30D', kind: 'universal_trial', school_name: 'Universal Trial', status: 'trial_active', is_locked: false, device_grants: { A: {}, B: {} } });
  globalThis.__smsTestDb = db;
  ({ default: handler } = await import('../api/license-manage.js'));
});

test('auth: no secret, wrong secret and the old PIN are all refused', async () => {
  for (const secret of [null, 'wrong', '8866']) assert.equal((await call('GET', { secret })).statusCode, 401);
  assert.equal((await call('GET')).statusCode, 200);
});

test('create: server generates a unique key, applies validity, limit, and logs it', async () => {
  const res = await create({ contactPerson: 'Mr Shah', email: 'a@b.co', type: 'paid', days: 365 });
  assert.equal(res.statusCode, 201);
  const lic = res.body.license;
  assert.match(lic.licenseKey, /^SMS-NOBLES-[0-9A-F]{8}$/);
  assert.equal(lic.type, 'paid');
  assert.equal(lic.maxStudents, 500);
  assert.ok(lic.daysRemaining >= 364 && lic.daysRemaining <= 365);
  assert.equal(lic.boundDeviceId, null, 'a new key must not be pre-bound to a computer');
  const log = db.tables.license_audit_log;
  assert.equal(log.length, 1);
  assert.equal(log[0].action, 'create');
  assert.equal(log[0].license_key, lic.licenseKey);
  assert.notEqual((await create()).body.license.licenseKey, lic.licenseKey);
});

test('create: lifetime paid key has no end date; bad input is rejected with a clear message', async () => {
  const life = (await create({ type: 'paid', days: 9999 })).body.license;
  assert.equal(life.isLifetime, true);
  assert.equal(life.trialEndsAt, null);
  for (const bad of [{ schoolName: '  ' }, { email: 'nope' }, { maxStudents: 0 }, { maxStudents: 1.5 }, { days: 'abc' }, { type: 'free' }, { schoolName: 'x'.repeat(121) }]) {
    const r = await create(bad);
    assert.equal(r.statusCode, 400, JSON.stringify(bad));
    assert.ok(r.body.error);
  }
});

test('update: edits details only; key and plan fields validated; logged', async () => {
  const { licenseKey } = (await create()).body.license;
  const r = await call('POST', { body: { action: 'update', licenseKey, school: { schoolName: 'Noble Public School', phone: '+91 99999 00000' } } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.license.schoolName, 'Noble Public School');
  assert.equal(r.body.license.licenseKey, licenseKey);
  assert.equal((await call('POST', { body: { action: 'update', licenseKey, school: { schoolName: '' } } })).statusCode, 400);
  assert.equal((await call('POST', { body: { action: 'update', licenseKey, school: {} } })).statusCode, 400);
  assert.ok(db.tables.license_audit_log.some((e) => e.action === 'update'));
});

test('set_days: add days, set exact days, lifetime, and lifetime cannot be "extended"', async () => {
  const { licenseKey } = (await create({ days: 10 })).body.license;
  const added = (await call('POST', { body: { action: 'set_days', licenseKey, days: 30 } })).body.license;
  assert.ok(added.daysRemaining >= 39 && added.daysRemaining <= 40);
  const exact = (await call('POST', { body: { action: 'set_days', licenseKey, days: 5, exact: true } })).body.license;
  assert.ok(exact.daysRemaining >= 4 && exact.daysRemaining <= 5);
  const expiredNow = (await call('POST', { body: { action: 'set_days', licenseKey, days: 0, exact: true } })).body.license;
  assert.equal(expiredNow.daysRemaining, 0);
  const life = (await call('POST', { body: { action: 'set_days', licenseKey, days: 9999, exact: true } })).body.license;
  assert.equal(life.isLifetime, true);
  assert.equal((await call('POST', { body: { action: 'set_days', licenseKey, days: 30 } })).statusCode, 400);
  const back = (await call('POST', { body: { action: 'set_days', licenseKey, days: 30, exact: true } })).body.license;
  assert.equal(back.isLifetime, false);
});

test('lock / unlock, timer and student limit', async () => {
  const { licenseKey } = (await create()).body.license;
  assert.equal((await call('POST', { body: { action: 'set_lock', licenseKey, locked: true } })).body.license.status, 'suspended');
  assert.equal((await call('POST', { body: { action: 'set_lock', licenseKey, locked: false } })).body.license.status, 'trial_active');
  assert.equal((await call('POST', { body: { action: 'set_timer', licenseKey, visible: false } })).body.license.isTimerVisible, false);
  assert.equal((await call('POST', { body: { action: 'set_tier', licenseKey, maxStudents: 1000 } })).body.license.maxStudents, 1000);
  assert.equal((await call('POST', { body: { action: 'set_tier', licenseKey, maxStudents: -3 } })).statusCode, 400);
});

test('reset_device frees a bound key and records which computer it was', async () => {
  const { licenseKey } = (await create()).body.license;
  db.tables.school_licenses.find((r) => r.license_key === licenseKey).bound_device_id = 'HW-OLD';
  const r = await call('POST', { body: { action: 'reset_device', licenseKey } });
  assert.equal(r.body.license.boundDeviceId, null);
  assert.equal(db.tables.license_audit_log.at(-1).details.previousDevice, 'HW-OLD');
});

test('delete removes the school, keeps the log entry, and refuses shared keys', async () => {
  const { licenseKey } = (await create({ schoolName: 'Gone School' })).body.license;
  assert.equal((await call('POST', { body: { action: 'delete', licenseKey } })).statusCode, 200);
  assert.equal((await call('GET')).body.licenses.some((l) => l.licenseKey === licenseKey), false);
  const entry = db.tables.license_audit_log.find((e) => e.action === 'delete');
  assert.equal(entry.school_name, 'Gone School', 'the name stays readable in the log after deletion');
  assert.equal((await call('POST', { body: { action: 'delete', licenseKey: 'SMS-FREE-TRIAL-30D' } })).statusCode, 400);
  assert.equal((await call('POST', { body: { action: 'delete', licenseKey: 'SMS-DOES-NOT-EXIST' } })).statusCode, 404);
});

test('shared keys can be locked or reset but not edited or extended', async () => {
  const key = 'SMS-FREE-TRIAL-30D';
  assert.equal((await call('POST', { body: { action: 'set_lock', licenseKey: key, locked: true } })).statusCode, 200);
  assert.equal((await call('POST', { body: { action: 'set_days', licenseKey: key, days: 30 } })).statusCode, 400);
  assert.equal((await call('POST', { body: { action: 'update', licenseKey: key, school: { schoolName: 'x' } } })).statusCode, 400);
  const reset = await call('POST', { body: { action: 'reset_device', licenseKey: key } });
  assert.equal(Object.keys(db.tables.school_licenses[0].device_grants).length, 2, 'reset must not hand out fresh free trials');
  assert.equal(reset.statusCode, 200);
});

test('audit view: newest first, filterable by school, limited', async () => {
  const a = (await create({ schoolName: 'Alpha' })).body.license.licenseKey;
  await create({ schoolName: 'Beta' });
  await call('POST', { body: { action: 'set_lock', licenseKey: a, locked: true } });
  const all = (await call('GET', { query: { view: 'audit' } })).body.audit;
  assert.equal(all.length, 3);
  const mine = (await call('GET', { query: { view: 'audit', licenseKey: a } })).body.audit;
  assert.deepEqual(mine.map((e) => e.action).sort(), ['create', 'set_lock']);
  assert.equal((await call('GET', { query: { view: 'audit', limit: '1' } })).body.audit.length, 1);
  assert.equal((await call('GET', { query: { view: 'audit' }, secret: 'bad' })).statusCode, 401);
});

test('a failing audit write never blocks the change itself', async () => {
  const realFrom = db.from.bind(db);
  db.from = (name) => (name === 'license_audit_log'
    ? { insert: async () => ({ error: { message: 'table missing' } }) }
    : realFrom(name));
  const r = await create({ schoolName: 'Still Works' });
  assert.equal(r.statusCode, 201);
});
