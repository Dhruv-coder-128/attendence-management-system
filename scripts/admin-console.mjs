#!/usr/bin/env node
// SMS Admin Console: a local web page for everything the command-line tools do
// (make / renew licence keys, see all schools, raise the version, build the EXE + APK).
//   npm run console      or double-click  Start-Admin-Console.bat
// It listens on 127.0.0.1 only and needs the one-time token printed in its link, so no website or other PC can use it.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSigningKey, makeKey, renewKey, readIssued, PLANS, TIERS } from './make-key.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.SMS_ADMIN_DIR || path.join(os.homedir(), '.sms-admin');
const PUBLIC_KEY_FILE = path.join(ROOT, 'src/lib/licensePublicKey.js');
const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'admin-console.html');
const TOKEN = crypto.randomBytes(18).toString('hex');
const DAY = 86400000;
const KEY_FILES = ['signing-key.json', 'keys-issued.csv', 'updater.key', 'updater-key-password.txt', 'android-release.jks', 'android-signing.properties'];

let signingKeys = null;
async function keys() {
  if (!signingKeys) signingKeys = await loadSigningKey({ dataDir: DATA_DIR, publicKeyFile: PUBLIC_KEY_FILE, log: () => {} });
  return signingKeys;
}

const readVersion = () => {
  const v = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8').match(/"version":\s*"(\d+\.\d+\.\d+)"/);
  return v ? v[1] : '?';
};

function bumpVersion() {
  const pkgFile = path.join(ROOT, 'package.json');
  const gradleFile = path.join(ROOT, 'android/app/build.gradle');
  const pkg = fs.readFileSync(pkgFile, 'utf8');
  const m = pkg.match(/"version":\s*"(\d+)\.(\d+)\.(\d+)"/);
  if (!m) throw new Error('Could not find the version in package.json.');
  const next = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
  let gradle = fs.readFileSync(gradleFile, 'utf8');
  if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+"[^"]+"/.test(gradle)) throw new Error('Could not find versionCode / versionName in android/app/build.gradle.');
  gradle = gradle.replace(/versionCode\s+(\d+)/, (_, n) => `versionCode ${Number(n) + 1}`).replace(/versionName\s+"[^"]+"/, `versionName "${next}"`);
  fs.writeFileSync(pkgFile, pkg.replace(m[0], `"version": "${next}"`));
  fs.writeFileSync(gradleFile, gradle);
  return next;
}

function schools() {
  const latest = new Map();
  const count = new Map();
  readIssued(DATA_DIR).forEach((r) => {
    count.set(r.device, (count.get(r.device) || 0) + 1);
    const old = latest.get(r.device);
    if (!old || r.issued >= old.issued) latest.set(r.device, r);
  });
  const now = Date.now();
  return [...latest.values()]
    .map((r) => ({ ...r, keysIssued: count.get(r.device), daysLeft: Math.ceil((Date.parse(r.expires) - now) / DAY) }))
    .sort((a, b) => a.school.localeCompare(b.school));
}

function builtFiles(version) {
  const out = [];
  for (const [dir, kind] of [['release-exe', 'exe'], ['release-apk', 'apk']]) {
    const d = path.join(ROOT, dir);
    if (fs.existsSync(d)) fs.readdirSync(d).filter((f) => f.includes(`${version}`) && /\.(exe|apk)$/i.test(f) && !/System-v/.test(f)).forEach((f) => out.push({ kind, name: f, size: fs.statSync(path.join(d, f)).size }));
  }
  return out;
}

// ---------- one background job at a time (release build or tests) ----------
let job = { name: null, running: false, log: '', startedAt: 0, endedAt: 0, exitCode: null };
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r(?!\n)/g, '\n');

function startJob(type, notes) {
  if (job.running) throw new Error('A job is already running. Wait for it to finish.');
  let cmd;
  let args;
  if (type === 'release') {
    cmd = 'powershell.exe';
    args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts/release.ps1'), '-Notes', String(notes || 'Improvements and fixes.').slice(0, 300)];
  } else if (type === 'tests') {
    cmd = process.execPath;
    args = ['--test', 'tests/*.test.mjs'];
  } else throw new Error('Unknown job.');
  job = { name: type, running: true, log: '', startedAt: Date.now(), endedAt: 0, exitCode: null };
  const cur = job;
  const add = (d) => { cur.log = (cur.log + stripAnsi(d.toString())).slice(-200000); };
  const child = spawn(cmd, args, { cwd: ROOT, windowsHide: true });
  child.stdout.on('data', add);
  child.stderr.on('data', add);
  child.on('error', (e) => { add(`\nCould not start: ${e.message}\n`); cur.running = false; cur.exitCode = -1; cur.endedAt = Date.now(); });
  child.on('close', (code) => { cur.running = false; cur.exitCode = code; cur.endedAt = Date.now(); });
}

function openFolder(what) {
  const v = readVersion();
  const dir = { exe: path.join(ROOT, 'release-exe'), apk: path.join(ROOT, 'release-apk'), upload: path.join(ROOT, 'release-upload', `v${v}`), keys: DATA_DIR }[what];
  if (!dir) throw new Error('Unknown folder.');
  if (!fs.existsSync(dir)) throw new Error('That folder does not exist yet. Build a release first.');
  spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
}

// ---------- HTTP ----------
const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 65536) { reject(new Error('Request too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('Bad request.')); } });
  });
}

async function handle(req, res, port) {
  const host = req.headers.host || '';
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, 'Forbidden', 'text/plain');
  const url = new URL(req.url, `http://${host}`);

  if (url.pathname === '/') {
    if (url.searchParams.get('t') !== TOKEN) return send(res, 403, 'Open this console from the link printed in the black window.', 'text/plain');
    return send(res, 200, fs.readFileSync(PAGE, 'utf8'), 'text/html; charset=utf-8');
  }
  if (!url.pathname.startsWith('/api/')) return send(res, 404, 'Not found', 'text/plain');
  if (req.headers['x-console-token'] !== TOKEN) return send(res, 403, { error: 'Not allowed.' });
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${host}`) return send(res, 403, { error: 'Not allowed.' });
  }

  try {
    if (url.pathname === '/api/state' && req.method === 'GET') {
      const version = readVersion();
      return send(res, 200, {
        version,
        plans: PLANS, tiers: TIERS,
        schools: schools(),
        keyFiles: KEY_FILES.map((f) => ({ name: f, ok: fs.existsSync(path.join(DATA_DIR, f)) })),
        dataDir: DATA_DIR,
        built: builtFiles(version),
        uploadReady: fs.existsSync(path.join(ROOT, 'release-upload', `v${version}`)),
        job: { name: job.name, running: job.running, exitCode: job.exitCode, startedAt: job.startedAt, endedAt: job.endedAt },
      });
    }
    if (url.pathname === '/api/job' && req.method === 'GET') {
      const from = Math.max(0, Number(url.searchParams.get('from')) || 0);
      return send(res, 200, { name: job.name, running: job.running, exitCode: job.exitCode, startedAt: job.startedAt, endedAt: job.endedAt, length: job.log.length, text: job.log.slice(from) });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
    const b = await readBody(req);

    if (url.pathname === '/api/key/new') {
      const r = await makeKey({ days: b.days, deviceId: b.deviceId, schoolName: b.school, students: b.students, keys: await keys(), dataDir: DATA_DIR });
      return send(res, 200, { ...r, plan: `${b.days} days` });
    }
    if (url.pathname === '/api/key/renew') {
      const r = await renewKey({ school: b.school, days: b.days, students: b.students || undefined, device: b.device || undefined, carry: b.carry !== false, keys: await keys(), dataDir: DATA_DIR });
      return send(res, 200, { key: r.key, expiresAt: r.expiresAt, students: r.students, school: r.school, device: r.device, carried: r.carried, planDays: r.planDays });
    }
    if (url.pathname === '/api/version/bump') return send(res, 200, { version: bumpVersion() });
    if (url.pathname === '/api/job/start') { startJob(b.type, b.notes); return send(res, 200, { ok: true }); }
    if (url.pathname === '/api/open') { openFolder(b.what); return send(res, 200, { ok: true }); }
    return send(res, 404, { error: 'Not found.' });
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
}

async function listen() {
  for (let port = 5757; port < 5777; port++) {
    const server = http.createServer((req, res) => { handle(req, res, port).catch((e) => send(res, 500, { error: e.message })); });
    const ok = await new Promise((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => resolve(true));
    });
    if (ok) return port;
  }
  throw new Error('No free port between 5757 and 5776.');
}

const port = await listen();
const link = `http://127.0.0.1:${port}/?t=${TOKEN}`;
console.log(`\nSMS Admin Console is running.\nOpen:  ${link}\n\nKeep this window open while you use it. Close it to stop the console.\n`);
if (!process.env.SMS_NO_BROWSER) spawn('cmd.exe', ['/c', 'start', '', link], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
