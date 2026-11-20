// The desktop app's licence flow (src/lib/licenseService.js) with a fake browser + Tauri. Run: npm test
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateSigningKeys, signLicense } from '../src/lib/offlineLicense.js';

const DEVICE = 'HW-WIN-1A2B3C4D-TEST-GUID';
const DAY = 86400000;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
// Pretend to be the Tauri desktop app; the Rust command returns the Windows MachineGuid.
globalThis.window = {
  __TAURI_INTERNALS__: { invoke: async (cmd) => (cmd === 'get_hardware_device_id' ? DEVICE : null), transformCallback: () => 0 },
  localStorage: globalThis.localStorage,
  dispatchEvent: () => true,
  navigator: {},
  screen: {},
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

let svc, keys;
const realNow = Date.now;
before(async () => {
  keys = await generateSigningKeys();
  svc = await import('../src/lib/licenseService.js');
});
beforeEach(() => { store.clear(); Date.now = realNow; });
const sign = (over = {}) => signLicense({ schoolName: 'Noble School', deviceId: DEVICE, type: 'paid', days: 30, maxStudents: 500, ...over }, keys.privateJwk);
const validate = () => svc.validateLicense({ publicKey: keys.publicJwk });

test('fresh desktop install is locked until a key is entered', async () => {
  const res = await validate();
  assert.equal(res.status, 'unlicensed');
  assert.equal(res.isLocked, true);
});

test('a key for this computer activates; school name and student limit come from the key', async () => {
  const res = await svc.activateSchoolLicense(await sign(), keys.publicJwk);
  assert.equal(res.ok, true, res.error);
  const v = await validate();
  assert.equal(v.ok, true);
  assert.equal(v.status, 'licensed');
  assert.equal(v.schoolName, 'Noble School');
  assert.equal(svc.getMaxStudentCapacity(), 500);
  assert.equal(svc.checkStudentCapacityAllowed(500, 1).allowed, false);
  assert.equal(v.daysRemaining, 30, 'a 30-day key shows 30 days left right after activation');
});

test('a key for another computer is refused with a clear message', async () => {
  const res = await svc.activateSchoolLicense(await sign({ deviceId: 'HW-WIN-SOMEONE-ELSE' }), keys.publicJwk);
  assert.equal(res.ok, false);
  assert.match(res.error, /different computer/);
  assert.equal(svc.getStoredLicense(), null, 'nothing saved');
});

test('editing the saved licence in storage does not raise the student limit or extend it', async () => {
  await svc.activateSchoolLicense(await sign(), keys.publicJwk);
  const raw = JSON.parse(store.get('sms_school_license'));
  store.set('sms_school_license', JSON.stringify({ ...raw, maxStudents: 99999, trialEndsAt: '2099-01-01T00:00:00Z', status: 'licensed' }));
  await validate();
  assert.equal(svc.getMaxStudentCapacity(), 500, 'limit re-read from the signed key at start-up');
  assert.notEqual(svc.getStoredLicense().trialEndsAt, '2099-01-01T00:00:00Z');
});

test('swapping the saved key for a forged one locks the app', async () => {
  await svc.activateSchoolLicense(await sign(), keys.publicJwk);
  const forger = await generateSigningKeys();
  const forged = await signLicense({ schoolName: 'Free', deviceId: DEVICE, type: 'paid', days: 9999, maxStudents: 99999 }, forger.privateJwk);
  store.set('sms_school_license', JSON.stringify({ ...JSON.parse(store.get('sms_school_license')), licenseKey: forged }));
  const v = await validate();
  assert.equal(v.ok, false);
  assert.equal(v.isLocked, true);
});

test('the app locks when the key expires, and a renewal key unlocks it', async () => {
  await svc.activateSchoolLicense(await sign({ days: 30 }), keys.publicJwk);
  const start = realNow();
  Date.now = () => start + 31 * DAY;
  const v = await validate();
  assert.equal(v.status, 'trial_expired');
  assert.equal(v.isLocked, true);
  Date.now = realNow;
  assert.equal((await svc.activateSchoolLicense(await sign({ days: 365 }), keys.publicJwk)).ok, true);
  assert.equal((await validate()).ok, true);
});

test('winding the PC clock back after use locks the app', async () => {
  await svc.activateSchoolLicense(await sign({ days: 30 }), keys.publicJwk);
  const start = realNow();
  Date.now = () => start + 20 * DAY;
  assert.equal((await validate()).ok, true);
  Date.now = () => start + 2 * DAY;
  assert.equal((await validate()).status, 'clock_tampered');
  // Support path: the developer sends a fresh key, which clears the lock.
  assert.equal((await svc.activateSchoolLicense(await sign({ days: 30 }), keys.publicJwk)).ok, true);
  assert.equal((await validate()).ok, true);
});
