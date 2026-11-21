// Offline licence keys and the key-making command (npm run key). Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateSigningKeys, signLicense, verifyLicense } from '../src/lib/offlineLicense.js';
import { loadSigningKey, makeKey, renewKey, readIssued, listIssued, PLANS } from '../scripts/make-key.mjs';

const DAY = 86400000;
let keys;
before(async () => { keys = await generateSigningKeys(); });
const sign = (over = {}, now) => signLicense({ schoolName: 'Noble School', deviceId: 'HW-WIN-ABC-123', type: 'paid', days: 365, maxStudents: 500, ...over }, keys.privateJwk, now);

// ---------- keys ----------
test('a genuine key works on its own computer and carries school, plan and expiry', async () => {
  const key = await sign();
  assert.match(key, /^SMS2-([0-9A-Z]{1,5}-)+[0-9A-Z]{1,5}$/);
  const res = await verifyLicense(key, 'HW-WIN-ABC-123', keys.publicJwk);
  assert.equal(res.ok, true);
  assert.equal(res.license.schoolName, 'Noble School');
  assert.equal(res.license.type, 'paid');
  assert.equal(res.license.maxStudents, 500);
  const days = (Date.parse(res.license.expiresAt) - Date.now()) / DAY;
  assert.ok(days > 364 && days <= 366, `expires in ${days} days`);
});

test('pasting through WhatsApp (lower case, spaces, new lines, bold *) still works', async () => {
  const key = await sign();
  const mangled = `*${key.toLowerCase().replace(/-/g, ' ').replace(/(.{40})/g, '$1\n')}*`;
  assert.equal((await verifyLicense(mangled, ' hw-win-abc-123 ', keys.publicJwk)).ok, true);
});

test('a key does not work on another computer', async () => {
  const res = await verifyLicense(await sign(), 'HW-WIN-OTHER-PC', keys.publicJwk);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'wrong_device');
});

test('changing any character, or a key from someone else\'s signing key, is rejected', async () => {
  const key = await sign();
  for (const i of [6, 40, 120, key.length - 2]) {
    const c = key[i] === 'A' ? 'B' : 'A';
    const tampered = key.slice(0, i) + c + key.slice(i + 1);
    assert.equal((await verifyLicense(tampered, 'HW-WIN-ABC-123', keys.publicJwk)).reason, 'invalid', `position ${i}`);
  }
  const forger = await generateSigningKeys();
  const forged = await signLicense({ schoolName: 'Free', deviceId: 'HW-WIN-ABC-123', type: 'paid', days: 9999, maxStudents: 99999 }, forger.privateJwk);
  assert.equal((await verifyLicense(forged, 'HW-WIN-ABC-123', keys.publicJwk)).reason, 'invalid');
  for (const junk of ['', 'SMS-FREE-TRIAL-30D', 'SMS2-', 'hello', 'SMS2-ZZZZZ-ZZZZZ']) {
    assert.equal((await verifyLicense(junk, 'X', keys.publicJwk)).ok, false, junk);
  }
});

test('expiry, lifetime keys, and winding the clock back before the issue date', async () => {
  const key = await sign({ days: 30 });
  assert.equal((await verifyLicense(key, 'HW-WIN-ABC-123', keys.publicJwk, Date.now() + 29 * DAY)).ok, true);
  assert.equal((await verifyLicense(key, 'HW-WIN-ABC-123', keys.publicJwk, Date.now() + 31 * DAY)).reason, 'expired');
  assert.equal((await verifyLicense(key, 'HW-WIN-ABC-123', keys.publicJwk, Date.now() - 10 * DAY)).reason, 'clock');
  const life = await sign({ days: 9999 });
  const res = await verifyLicense(life, 'HW-WIN-ABC-123', keys.publicJwk, Date.now() + 40 * 365 * DAY);
  assert.equal(res.ok, true);
  assert.equal(res.license.expiresAt, null);
});

test('long Gujarati school names are shortened without breaking letters', async () => {
  const name = 'શ્રી સરસ્વતી વિદ્યા મંદિર હાઈસ્કૂલ રાજકોટ ગુજરાત';
  const res = await verifyLicense(await sign({ schoolName: name }), 'HW-WIN-ABC-123', keys.publicJwk);
  assert.equal(res.ok, true);
  assert.ok(name.startsWith(res.license.schoolName));
  assert.ok(!res.license.schoolName.includes('�'));
});

// ---------- admin tool ----------
let dir, publicKeyFile;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-admin-test-'));
  publicKeyFile = path.join(dir, 'licensePublicKey.js');
  fs.writeFileSync(publicKeyFile, 'export const LICENSE_PUBLIC_KEY = null;\n');
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const quiet = () => {};

test('first run creates the signing key and writes the public key into the app source', async () => {
  const k = await loadSigningKey({ dataDir: path.join(dir, 'a'), publicKeyFile, log: quiet });
  const src = fs.readFileSync(publicKeyFile, 'utf8');
  assert.match(src, new RegExp(k.publicJwk.x));
  assert.doesNotMatch(src, /"d"/, 'the PRIVATE key must never be written into the app');
  const again = await loadSigningKey({ dataDir: path.join(dir, 'a'), publicKeyFile, log: quiet });
  assert.equal(again.publicJwk.x, k.publicJwk.x, 'second run reuses the same key');
});

test('refuses to silently make a new key when the app already has one (protects keys already sold)', async () => {
  await assert.rejects(loadSigningKey({ dataDir: path.join(dir, 'other-pc'), publicKeyFile, log: quiet }), /Signing key not found/);
  const fresh = await loadSigningKey({ dataDir: path.join(dir, 'other-pc'), publicKeyFile, allowNew: true, log: quiet });
  assert.ok(fresh.privateJwk.d);
});

test('each plan (10/30/180/365 days) lasts its full length, whatever time of day it is made, then stops', async () => {
  const start = Date.parse('2026-11-17T00:00:00Z');
  for (const days of PLANS) {
    for (const hour of [0, 9.5, 18, 23.99]) { // includes 3 PM and late-night India time
      const now = start + hour * 3600000;
      const key = await sign({ days }, now);
      assert.equal((await verifyLicense(key, 'HW-WIN-ABC-123', keys.publicJwk, now + days * DAY - 60000)).ok, true, `${days}d made at ${hour}h still works on its last day`);
      assert.equal((await verifyLicense(key, 'HW-WIN-ABC-123', keys.publicJwk, now + (days + 1) * DAY)).reason, 'expired', `${days}d made at ${hour}h has stopped a day later`);
    }
  }
});

test('npm run key: makes a working key, records it, and rejects other durations or a missing Device ID', async () => {
  const dataDir = fs.mkdtempSync(path.join(dir, 'key-'));
  const k = await loadSigningKey({ dataDir, publicKeyFile: path.join(dataDir, 'pk.js'), log: quiet });
  const { key, expiresAt } = await makeKey({ days: '30', deviceId: ' hw-win-abc-123 ', schoolName: 'Noble "A" School', keys: k, dataDir });
  const res = await verifyLicense(key, 'HW-WIN-ABC-123', k.publicJwk);
  assert.equal(res.ok, true);
  assert.equal(res.license.schoolName, 'Noble "A" School');
  assert.equal(res.license.expiresAt, expiresAt);
  const csv = fs.readFileSync(path.join(dataDir, 'keys-issued.csv'), 'utf8').trim().split('\n');
  assert.equal(csv.length, 2);
  assert.match(csv[1], /,30,200,"Noble ""A"" School",HW-WIN-ABC-123,SMS2-/);
  assert.equal(res.license.maxStudents, 200, 'a forgotten --students gives the smallest plan, never unlimited');
  for (const days of [0, 7, 31, 9999, 'abc']) await assert.rejects(makeKey({ days, deviceId: 'HW-WIN-ABC-123', keys: k, dataDir }), /Days must be/, String(days));
  await assert.rejects(makeKey({ days: 10, deviceId: 'ab', keys: k, dataDir }), /Device ID/);
});

// ---------- plan sizes, renew / upgrade, records file ----------
async function freshDir() {
  const dataDir = fs.mkdtempSync(path.join(dir, 'plan-'));
  const k = await loadSigningKey({ dataDir, publicKeyFile: path.join(dataDir, 'pk.js'), log: quiet });
  return { dataDir, k };
}
const NOW = Date.parse('2026-11-20T10:00:00Z');

test('student plans 200 / 500 / 1000 / 5000 are carried inside the key; anything else is refused', async () => {
  const { dataDir, k } = await freshDir();
  for (const students of [200, 500, 1000, 5000]) {
    const { key } = await makeKey({ days: 30, deviceId: 'HW-WIN-ABC-123', schoolName: 'S', students, keys: k, dataDir });
    assert.equal((await verifyLicense(key, 'HW-WIN-ABC-123', k.publicJwk)).license.maxStudents, students);
  }
  for (const bad of [300, 0, 'abc', 100000, 5001]) {
    await assert.rejects(makeKey({ days: 30, deviceId: 'HW-WIN-ABC-123', students: bad, keys: k, dataDir }), /Students must be/, String(bad));
  }
});

test('renew: finds the school, keeps its plan size, carries unused PAID days, gives a trial none', async () => {
  const { dataDir, k } = await freshDir();
  const day = 86400000;
  await makeKey({ days: 10, deviceId: 'HW-WIN-NOBLE-1', schoolName: 'Noble School', students: 200, keys: k, dataDir, now: NOW });

  // trial -> full year, bigger plan, 3 days into the trial: nothing carried (it was a trial), new plan size used
  const up = await renewKey({ school: 'noble', days: 365, students: 500, keys: k, dataDir, now: NOW + 3 * day });
  assert.equal(up.carried, 0);
  assert.equal(up.students, 500);
  assert.equal(up.device, 'HW-WIN-NOBLE-1', 'the computer is found from the school name');
  const v = await verifyLicense(up.key, 'HW-WIN-NOBLE-1', k.publicJwk, NOW + 3 * day);
  assert.equal(v.ok, true);
  assert.equal(v.license.type, 'paid');
  assert.equal(v.license.maxStudents, 500);
  const prevExpiry = Date.parse(up.expiresAt);
  assert.ok((prevExpiry - (NOW + 3 * day)) / day >= 365, 'a full 365 days from the day it was made');

  // renew the paid year 100 days later: unused days are added, plan size kept without being repeated
  const again = await renewKey({ school: 'Noble School', days: 30, keys: k, dataDir, now: NOW + 100 * day });
  assert.equal(again.students, 500, 'plan size inherited');
  assert.ok(again.carried > 200, `carried ${again.carried}`);
  assert.equal(Date.parse(again.expiresAt), prevExpiry + 30 * day, 'new end = old end + 30 days exactly');

  // --no-carry
  const flat = await renewKey({ school: 'Noble School', days: 30, carry: false, keys: k, dataDir, now: NOW + 100 * day });
  assert.equal(flat.carried, 0);
  assert.ok(Date.parse(flat.expiresAt) < prevExpiry, 'without carry-over it ends sooner');

  // school moved to a new computer: new key for it, no carry from the old computer
  const moved = await renewKey({ school: 'Noble School', days: 30, device: 'hw-win-new-pc-9', keys: k, dataDir, now: NOW + 100 * day });
  assert.equal(moved.carried, 0);
  assert.equal((await verifyLicense(moved.key, 'HW-WIN-NEW-PC-9', k.publicJwk, NOW + 100 * day)).ok, true);
  assert.equal((await verifyLicense(moved.key, 'HW-WIN-NOBLE-1', k.publicJwk, NOW + 100 * day)).reason, 'wrong_device');
});

test('renew: clear errors for an unknown school, two matches, and a bad plan', async () => {
  const { dataDir, k } = await freshDir();
  await makeKey({ days: 30, deviceId: 'HW-WIN-AAA-111', schoolName: 'City School', keys: k, dataDir, now: NOW });
  await makeKey({ days: 30, deviceId: 'HW-WIN-BBB-222', schoolName: 'City School', keys: k, dataDir, now: NOW });
  await assert.rejects(renewKey({ school: 'Nobody', days: 30, keys: k, dataDir, now: NOW }), /No school matching/);
  await assert.rejects(renewKey({ school: 'City School', days: 30, keys: k, dataDir, now: NOW }), /More than one computer/);
  assert.equal((await renewKey({ school: 'City School', days: 30, device: 'HW-WIN-BBB-222', keys: k, dataDir, now: NOW })).device, 'HW-WIN-BBB-222');
  await assert.rejects(renewKey({ school: 'City School', days: 7, device: 'HW-WIN-AAA-111', keys: k, dataDir, now: NOW }), /Days must be/);
});

test('an older keys-issued.csv (no students column) is upgraded in place and nothing is lost', async () => {
  const { dataDir, k } = await freshDir();
  const file = path.join(dataDir, 'keys-issued.csv');
  fs.writeFileSync(file, 'issued,expires,days,school,device,key\n2026-11-01T00:00:00.000Z,2026-12-01T00:00:00.000Z,30,"Old, School",HW-WIN-OLD-1,SMS2-AAA\n');
  const rows = readIssued(dataDir);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].school, 'Old, School', 'comma inside a name survives');
  assert.equal(rows[0].students, 5000, 'keys sold before plan sizes existed were unlimited');
  assert.ok(fs.existsSync(file + '.bak'), 'backup of the old file kept');
  assert.match(fs.readFileSync(file, 'utf8').split('\n')[0], /students/);
  await makeKey({ days: 30, deviceId: 'HW-WIN-NEW-2', schoolName: 'New "Q" School', keys: k, dataDir, now: NOW });
  const after = readIssued(dataDir);
  assert.equal(after.length, 2);
  assert.equal(after[1].school, 'New "Q" School');
});

test('list: one line per computer, latest key, with clear status', async () => {
  const { dataDir, k } = await freshDir();
  const day = 86400000;
  await makeKey({ days: 30, deviceId: 'HW-WIN-L-1', schoolName: 'Alpha', students: 500, keys: k, dataDir, now: NOW });
  await makeKey({ days: 10, deviceId: 'HW-WIN-L-2', schoolName: 'Beta', keys: k, dataDir, now: NOW });
  await renewKey({ school: 'Alpha', days: 365, keys: k, dataDir, now: NOW + 20 * day });
  const out = listIssued(dataDir, NOW + 21 * day);
  assert.equal(out.split('\n').filter((l) => l.startsWith('Alpha')).length, 1, 'latest key only');
  assert.match(out, /Alpha\s+375-day\s+500/, 'renewed 20 days into a 30-day key: 365 + 10 unused days');
  assert.match(out, /Beta\s+Trial\s+200\s+.*EXPIRED/);
  assert.match(listIssued(dataDir, NOW + 28 * day), /Alpha[\s\S]*Beta/);
});
