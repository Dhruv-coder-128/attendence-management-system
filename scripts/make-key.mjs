#!/usr/bin/env node
// Makes licence keys on the developer's PC. No server, no admin panel.
//
//   npm run key -- <days> <Device ID> "School name" [--students 200|500|1000|5000]
//   npm run key -- renew "School name" <days> [--students N] [--device <new Device ID>] [--no-carry]
//   npm run key -- list
//
// <days> is one of 10, 30, 180, 365. The key works only on that computer, from now until now + <days>,
// then the app locks and shows "Contact Developer". --students sets the plan size: 200, 500, 1000 or 5000 (= unlimited).
// `renew` finds the school's computer from keys-issued.csv, keeps its plan size unless you change it, and adds the days
// still left on a paid key. Data on the school's PC is never touched by a new key.
//
// Keeps, in %USERPROFILE%\.sms-admin (override with SMS_ADMIN_DIR):
//   signing-key.json  PRIVATE signing key. Back this up! Without it, existing app builds can't accept new keys.
//   keys-issued.csv   one line per key you made (your record of who got what).
// The matching PUBLIC key is written into src/lib/licensePublicKey.js so app builds can check keys offline.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSigningKeys, signLicense, verifyLicense, normalizeDeviceId } from '../src/lib/offlineLicense.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLANS = [10, 30, 180, 365];
/** Student limit per key. 5000 means "no limit" in the app. The default is the smallest, so a forgotten flag never gives away more. */
export const TIERS = { 200: 'Starter', 500: 'Growth', 1000: 'Pro', 5000: 'Enterprise (unlimited)' };
const DEFAULT_STUDENTS = 200;
const DAY = 86400000;
const CSV_HEADER = 'issued,expires,days,students,school,device,key';

function readPublicKeyFromSource(file) {
  const m = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').match(/LICENSE_PUBLIC_KEY = (.*);/) : null;
  return m && m[1].trim() !== 'null' ? JSON.parse(m[1]) : null;
}

/**
 * Loads (or on first run creates) the signing key and makes sure the app source has the matching public key.
 * Refuses to silently create a NEW key when the app already has one: that would break every key already sold.
 */
export async function loadSigningKey({ dataDir, publicKeyFile, allowNew = false, log = console.log }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const keyFile = path.join(dataDir, 'signing-key.json');
  const inSource = readPublicKeyFromSource(publicKeyFile);
  let keys;
  if (fs.existsSync(keyFile)) {
    keys = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  } else {
    if (inSource && !allowNew) {
      throw new Error(
        `Signing key not found in ${dataDir}, but the app already contains a public key.\n` +
        `Copy your backed-up signing-key.json into that folder.\n` +
        `Only if it is truly lost: add --new-key (every key issued before will stop working in new builds).`
      );
    }
    keys = { ...(await generateSigningKeys()), createdAt: new Date().toISOString() };
    fs.writeFileSync(keyFile, JSON.stringify(keys, null, 2));
    log(`New signing key created: ${keyFile}\nBACK THIS FILE UP (USB drive / Google Drive). If you lose it, you can't make keys for existing installs.`);
  }
  const same = inSource && inSource.x === keys.publicJwk.x && inSource.y === keys.publicJwk.y;
  if (!same) {
    const { kty, crv, x, y } = keys.publicJwk;
    fs.writeFileSync(publicKeyFile,
      '// Public half of the licence signing key. Written automatically by scripts/make-key.mjs.\n' +
      '// Safe to publish: it can only CHECK keys, never create them. The private half stays on the developer\'s PC.\n' +
      `export const LICENSE_PUBLIC_KEY = ${JSON.stringify({ kty, crv, x, y })};\n`);
    log(`Public key written to ${path.relative(ROOT, publicKeyFile)}. Rebuild the EXE (npm run build:desktop) so it accepts your keys.`);
  }
  return keys;
}

// ---------- record of issued keys (keys-issued.csv) ----------
const quote = (s) => `"${String(s).replace(/"/g, '""')}"`;

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const rowToLine = (r) => [r.issued, r.expires, r.days, r.students, quote(r.school), r.device, r.key].join(',');

function writeIssued(dataDir, rows) {
  const file = path.join(dataDir, 'keys-issued.csv');
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  fs.writeFileSync(file, CSV_HEADER + '\n' + rows.map(rowToLine).join('\n') + (rows.length ? '\n' : ''));
}

/** Reads keys-issued.csv; upgrades an older file (without the students column) in place. */
export function readIssued(dataDir) {
  const file = path.join(dataDir, 'keys-issued.csv');
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const hasStudents = (lines[0] || '').split(',').includes('students');
  const rows = lines.slice(1).map((l) => {
    const c = parseCsvLine(l);
    return hasStudents
      ? { issued: c[0], expires: c[1], days: Number(c[2]), students: Number(c[3]) || DEFAULT_STUDENTS, school: c[4], device: c[5], key: c[6] }
      : { issued: c[0], expires: c[1], days: Number(c[2]), students: 5000, school: c[3], device: c[4], key: c[5] }; // old rows had no limit
  });
  if (!hasStudents) writeIssued(dataDir, rows);
  return rows;
}

function appendIssued(dataDir, row) {
  const file = path.join(dataDir, 'keys-issued.csv');
  if (fs.existsSync(file)) readIssued(dataDir); // upgrades an old file first
  else fs.writeFileSync(file, CSV_HEADER + '\n');
  fs.appendFileSync(file, rowToLine(row) + '\n');
}

/** Signs a key for one computer, double-checks it, and records it in keys-issued.csv. */
export async function makeKey({ days, deviceId, schoolName = '', students = DEFAULT_STUDENTS, keys, dataDir, now = Date.now(), anyDays = false }) {
  days = Number(days);
  if (anyDays ? !(days >= 1 && days <= 3650) : !PLANS.includes(days)) throw new Error(`Days must be one of ${PLANS.join(', ')}.`);
  students = Number(students);
  if (!TIERS[students]) throw new Error(`Students must be one of ${Object.keys(TIERS).join(', ')} (5000 = unlimited).`);
  const device = normalizeDeviceId(deviceId);
  if (device.length < 6) throw new Error('Device ID is missing or too short. Copy it from the school\'s activation screen.');
  const name = String(schoolName).trim().slice(0, 60);

  const key = await signLicense({ schoolName: name, deviceId: device, type: days <= 10 ? 'trial' : 'paid', days, maxStudents: students }, keys.privateJwk, now);
  const check = await verifyLicense(key, device, keys.publicJwk, now);
  if (!check.ok) throw new Error(`Self-check failed (${check.reason}); key not issued.`);

  appendIssued(dataDir, { issued: new Date(now).toISOString(), expires: check.license.expiresAt, days, students, school: name, device, key });
  return { key, expiresAt: check.license.expiresAt, students, school: name, device };
}

/** Latest key of each computer. */
function latestPerDevice(rows) {
  const m = new Map();
  rows.forEach((r) => {
    const old = m.get(r.device);
    if (!old || r.issued >= old.issued) m.set(r.device, r);
  });
  return [...m.values()];
}

/**
 * Upgrade or renew a school that already has a key. Finds its computer by school name (or uses `device`),
 * keeps the previous student limit unless `students` is given, and adds the days still left on a PAID key.
 */
export async function renewKey({ school, days, students, device, carry = true, keys, dataDir, now = Date.now() }) {
  if (!PLANS.includes(Number(days))) throw new Error(`Days must be one of ${PLANS.join(', ')}.`);
  const rows = latestPerDevice(readIssued(dataDir));
  const term = String(school || '').trim().toLowerCase();
  if (!term) throw new Error('Give the school name, e.g.  npm run key -- renew "Noble School" 365');

  let prev;
  if (device) {
    const d = normalizeDeviceId(device);
    prev = rows.find((r) => r.device === d) || rows.find((r) => r.school.toLowerCase() === term);
  } else {
    const exact = rows.filter((r) => r.school.toLowerCase() === term);
    const matches = exact.length ? exact : rows.filter((r) => r.school.toLowerCase().includes(term));
    if (matches.length === 0) throw new Error(`No school matching "${school}" in keys-issued.csv. Run "npm run key -- list" to see schools, or pass --device <Device ID>.`);
    if (matches.length > 1) throw new Error(`More than one computer matches "${school}":\n${matches.map((r) => `  ${r.school}  ${r.device}`).join('\n')}\nPass --device <Device ID> to choose.`);
    prev = matches[0];
  }
  const target = device ? normalizeDeviceId(device) : prev.device;

  // Carry over the unused days of a paid key on the same computer (never of a 10-day trial).
  let carried = 0;
  if (carry && prev && prev.days > 10 && prev.device === target && Date.parse(prev.expires) > now) {
    carried = Math.floor((Date.parse(prev.expires) - now) / DAY);
  }
  const res = await makeKey({
    days: Number(days) + carried, anyDays: true, deviceId: target, schoolName: prev?.school || school,
    students: students ?? prev?.students ?? DEFAULT_STUDENTS, keys, dataDir, now,
  });
  return { ...res, carried, planDays: Number(days), previous: prev || null };
}

export function listIssued(dataDir, now = Date.now()) {
  const rows = latestPerDevice(readIssued(dataDir)).sort((a, b) => a.school.localeCompare(b.school));
  if (!rows.length) return 'No keys issued yet.';
  const status = (r) => {
    const left = Math.ceil((Date.parse(r.expires) - now) / DAY);
    if (left <= 0) return 'EXPIRED';
    return left <= 7 ? `ends in ${left}d - renew soon` : `${left} days left`;
  };
  const w = (s, n) => String(s).padEnd(n).slice(0, n);
  const head = w('SCHOOL', 26) + w('KEY LENGTH', 12) + w('STUDENTS', 11) + w('ENDS', 13) + w('STATUS', 26) + 'DEVICE';
  return [head, ...rows.map((r) =>
    w(r.school || '(no name)', 26) + w(r.days <= 10 ? 'Trial' : `${r.days}-day`, 12) + w(r.students === 5000 ? 'Unlimited' : r.students, 11)
    + w(new Date(r.expires).toDateString().slice(4), 13) + w(status(r), 26) + r.device)].join('\n');
}

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--students' || a === '--device') flags[a.slice(2)] = argv[++i];
    else if (a.startsWith('--')) flags[a.slice(2)] = true;
    else pos.push(a);
  }
  return { pos, flags };
}

const USAGE = `
New school / new key:  npm run key -- <${PLANS.join('|')}> <Device ID> "School name" [--students ${Object.keys(TIERS).join('|')}]
Renew or upgrade:      npm run key -- renew "School name" <${PLANS.join('|')}> [--students N] [--device <new Device ID>] [--no-carry]
See all schools:       npm run key -- list

Students: ${Object.entries(TIERS).map(([n, t]) => `${n} = ${t}`).join(', ')}.  Default ${DEFAULT_STUDENTS}.
Example:  npm run key -- 365 HW-WIN-1A2B3C4D-... "Noble School" --students 500
`;

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const dataDir = process.env.SMS_ADMIN_DIR || path.join(os.homedir(), '.sms-admin');
  const keys = await loadSigningKey({ dataDir, publicKeyFile: path.join(ROOT, 'src/lib/licensePublicKey.js'), allowNew: Boolean(flags['new-key']) });
  const limit = (n) => (n === 5000 ? 'unlimited students' : `up to ${n} students`);
  const show = (r, lines) => console.log(
    `\n${r.school || '(no name)'} — ${TIERS[r.students]} (${limit(r.students)})\nComputer: ${r.device}\n${lines}\nValid until: ${new Date(r.expiresAt).toDateString()}\n\n${r.key}\n\nSaved to ${path.join(dataDir, 'keys-issued.csv')}\n`);

  if (pos[0] === 'list') { console.log('\n' + listIssued(dataDir) + '\n'); return; }

  if (pos[0] === 'renew') {
    const [, school, days] = pos;
    if (!school || !days) { console.log(USAGE); return; }
    const r = await renewKey({ school, days, students: flags.students, device: flags.device, carry: !flags['no-carry'], keys, dataDir });
    const plan = r.carried ? `Plan: ${r.planDays} days + ${r.carried} unused days from the previous key` : `Plan: ${r.planDays} days`;
    const change = r.previous && r.previous.students !== r.students ? `\nStudent limit changed: ${r.previous.students} -> ${r.students}` : '';
    show(r, plan + change);
    return;
  }

  if (pos.length < 2) { console.log(USAGE); return; }
  const [days, deviceId, ...name] = pos;
  const r = await makeKey({ days, deviceId, schoolName: name.join(' '), students: flags.students, keys, dataDir });
  show(r, `Plan: ${days} days`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`\n${err.message}\n`); process.exit(1); });
}
