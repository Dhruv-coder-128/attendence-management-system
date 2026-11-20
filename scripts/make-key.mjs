#!/usr/bin/env node
// Makes a licence key on the developer's PC. No server, no admin panel.
//
//   npm run key -- <days> <Device ID> ["School name"]
//   npm run key -- 30 HW-WIN-1A2B3C4D-... "Noble School"
//
// <days> is one of 10, 30, 180, 365. The key works only on that computer, from now until now + <days>,
// then the app locks and shows "Contact Developer".
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
const MAX_STUDENTS = 5000; // 5000+ = no student limit in the app

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

/** Signs a key for one computer, double-checks it, and appends it to keys-issued.csv. */
export async function makeKey({ days, deviceId, schoolName = '', keys, dataDir, now = Date.now() }) {
  days = Number(days);
  if (!PLANS.includes(days)) throw new Error(`Days must be one of ${PLANS.join(', ')}.`);
  const device = normalizeDeviceId(deviceId);
  if (device.length < 6) throw new Error('Device ID is missing or too short. Copy it from the school\'s activation screen.');
  const name = String(schoolName).trim().slice(0, 60);

  const key = await signLicense({ schoolName: name, deviceId: device, type: days <= 10 ? 'trial' : 'paid', days, maxStudents: MAX_STUDENTS }, keys.privateJwk, now);
  const check = await verifyLicense(key, device, keys.publicJwk, now);
  if (!check.ok) throw new Error(`Self-check failed (${check.reason}); key not issued.`);

  const csv = path.join(dataDir, 'keys-issued.csv');
  if (!fs.existsSync(csv)) fs.writeFileSync(csv, 'issued,expires,days,school,device,key\n');
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  fs.appendFileSync(csv, [new Date(now).toISOString(), check.license.expiresAt, days, q(name), device, key].join(',') + '\n');
  return { key, expiresAt: check.license.expiresAt };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const dataDir = process.env.SMS_ADMIN_DIR || path.join(os.homedir(), '.sms-admin');
  const keys = await loadSigningKey({ dataDir, publicKeyFile: path.join(ROOT, 'src/lib/licensePublicKey.js'), allowNew: process.argv.includes('--new-key') });
  if (args.length < 2) {
    console.log(`\nUsage: npm run key -- <${PLANS.join('|')}> <Device ID> ["School name"]\nExample: npm run key -- 30 HW-WIN-1A2B3C4D-... "Noble School"\n`);
    return;
  }
  const [days, deviceId, ...name] = args;
  const { key, expiresAt } = await makeKey({ days, deviceId, schoolName: name.join(' '), keys, dataDir });
  console.log(`\n${days}-day key for ${normalizeDeviceId(deviceId)} (valid until ${new Date(expiresAt).toDateString()}):\n\n${key}\n\nSaved to ${path.join(dataDir, 'keys-issued.csv')}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`\n${err.message}\n`); process.exit(1); });
}
