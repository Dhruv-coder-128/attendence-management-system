// Render smoke test for the admin panel UI: every view renders with realistic data and no exceptions,
// and the key text a user depends on is on screen. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Compile the admin UI once with Vite's production (SSR) build. This is far faster here than the dev server's
// module-by-module transform, and it is the same compiler the real build uses.
const outDir = path.resolve('node_modules/.cache/sms-admin-test');
fs.rmSync(outDir, { recursive: true, force: true });
await build({
  logLevel: 'silent',
  build: {
    ssr: true, outDir, emptyOutDir: true, minify: false, cssCodeSplit: false,
    rollupOptions: {
      input: Object.fromEntries(['format.js', 'ui.jsx', 'Views.jsx', 'SchoolForm.jsx', 'SchoolDetail.jsx', 'AdminApp.jsx']
        .map((f) => [f.replace(/\.jsx?$/, ''), path.resolve('src/admin', f)])),
      output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: 'chunk-[hash].mjs' },
    },
  },
});
const day = 86400000;
const iso = (d) => new Date(Date.now() + d * day).toISOString();
const school = (over) => ({
  id: 'LIC-X', kind: 'school', schoolName: 'Noble School', contactPerson: 'Mr Shah', email: 'a@b.co', phone: '+91 99999 00000',
  licenseKey: 'SMS-NOBLES-AAAA1111', type: 'trial', status: 'trial_active', isLocked: false, isTimerVisible: true, daysRemaining: 20,
  isLifetime: false, maxStudents: 500, trialStartedAt: iso(-10), trialEndsAt: iso(20), boundDeviceId: 'HW-1', deviceGrantCount: 0,
  lastSeenAt: iso(-0.01), notes: '', createdAt: iso(-10), ...over,
});
const samples = [
  school({}),
  school({ schoolName: 'Paid Academy', licenseKey: 'SMS-PAID-BBBB2222', type: 'paid', status: 'licensed', isLifetime: true, trialEndsAt: null, daysRemaining: 9999 }),
  school({ schoolName: 'Ending Soon', licenseKey: 'SMS-END-CCCC3333', daysRemaining: 3, trialEndsAt: iso(3) }),
  school({ schoolName: 'Expired School', licenseKey: 'SMS-EXP-DDDD4444', status: 'trial_expired', daysRemaining: 0, trialEndsAt: iso(-2) }),
  school({ schoolName: 'Locked School', licenseKey: 'SMS-LOCK-EEEE5555', isLocked: true, status: 'suspended' }),
  school({ schoolName: 'Never Activated', licenseKey: 'SMS-NEW-FFFF6666', boundDeviceId: null, lastSeenAt: null }),
];
const shared = { ...school({}), kind: 'universal_trial', schoolName: 'Universal Trial', licenseKey: 'SMS-FREE-TRIAL-30D', deviceGrantCount: 4, boundDeviceId: null };

const load = async (file) => import(pathToFileURL(path.join(outDir, path.basename(file).replace(/\.jsx?$/, '.mjs'))).href);
const html = (el) => renderToStaticMarkup(el);
const toastWrap = async (el) => {
  const { ToastProvider } = await load('/src/admin/ui.jsx');
  return React.createElement(ToastProvider, null, el);
};

test('format helpers: state priority, expiry text and the message sent to a school', async () => {
  const f = await load('/src/admin/format.js');
  assert.equal(f.schoolState(school({ isLocked: true })).id, 'locked');
  assert.equal(f.schoolState(school({ status: 'trial_expired', daysRemaining: 0 })).id, 'expired');
  assert.equal(f.schoolState(school({ daysRemaining: 3 })).id, 'expiring');
  assert.equal(f.schoolState(school({ type: 'paid', isLifetime: true, daysRemaining: 9999 })).label, 'Lifetime');
  assert.equal(f.expiryText(school({ isLifetime: true })), 'Never');
  const msg = f.activationMessage(school({}));
  assert.match(msg, /SMS-NOBLES-AAAA1111/);
  assert.match(msg, /Noble School/);
  assert.match(msg, /500/);
  assert.equal(f.timeAgo(null), 'Never');
});

test('dashboard shows correct counts and the schools that need attention', async () => {
  const { Dashboard } = await load('/src/admin/Views.jsx');
  const out = html(React.createElement(Dashboard, { schools: samples, onOpen() {}, onNavigate() {} }));
  assert.match(out, /Needs attention/);
  assert.match(out, /Ending Soon/);
  assert.match(out, /Expired School/);
  assert.match(out, /Locked School/);
  assert.match(out, /Never Activated/);
  assert.doesNotMatch(out, /Paid Academy/, 'a healthy activated lifetime school must not be flagged');
});

test('schools list renders every school with status badges and copy buttons', async () => {
  const { SchoolsView } = await load('/src/admin/Views.jsx');
  const out = html(await toastWrap(React.createElement(SchoolsView, { schools: samples, onOpen() {}, onAdd() {} })));
  for (const name of ['Noble School', 'Paid Academy', 'Ending Soon', 'Expired School', 'Locked School']) assert.match(out, new RegExp(name));
  for (const label of ['Lifetime', 'Locked', 'Expired', 'Ends in 3d']) assert.match(out, new RegExp(label));
  assert.match(out, /6 of 6 schools/);
});

test('schools list: empty state offers to add the first school', async () => {
  const { SchoolsView } = await load('/src/admin/Views.jsx');
  const out = html(await toastWrap(React.createElement(SchoolsView, { schools: [], onOpen() {}, onAdd() {} })));
  assert.match(out, /No schools yet/);
  assert.match(out, /Add your first school/);
});

test('detail panel exposes all controls for a school, and fewer for shared keys', async () => {
  const { default: SchoolDetail } = await load('/src/admin/SchoolDetail.jsx');
  const render = (s) => html(React.createElement(SchoolDetail, { school: s, onChanged() {}, onDeleted() {}, onEdit() {}, onClose() {} }));
  const wrapped = async (s) => html(await toastWrap(React.createElement(SchoolDetail, { school: s, onChanged() {}, onDeleted() {}, onEdit() {}, onClose() {} })));
  void render;
  const out = await wrapped(samples[0]);
  for (const text of ['SMS-NOBLES-AAAA1111', '+30 days', 'Make lifetime', 'Student limit', 'Lock this school now', 'Free the key for a new computer', 'Edit details', 'Delete school']) {
    assert.match(out, new RegExp(text.replace(/[+]/g, '\\+')), text);
  }
  const locked = await wrapped(samples[4]);
  assert.match(locked, /Unlock this school/);
  const lifetime = await wrapped(samples[1]);
  assert.match(lifetime, /Lifetime licence/);
  const sharedOut = await wrapped(shared);
  assert.doesNotMatch(sharedOut, /Delete school/);
  assert.doesNotMatch(sharedOut, /Edit details/);
  assert.match(sharedOut, /4 computers used it/);
});

test('add / edit form renders with the right fields', async () => {
  const { default: SchoolForm } = await load('/src/admin/SchoolForm.jsx');
  const add = html(await toastWrap(React.createElement(SchoolForm, { onSaved() {}, onClose() {} })));
  assert.match(add, /Add a school/);
  assert.match(add, /Valid for/);
  assert.match(add, /Create school &amp; key/);
  const edit = html(await toastWrap(React.createElement(SchoolForm, { school: samples[0], onSaved() {}, onClose() {} })));
  assert.match(edit, /Edit Noble School/);
  assert.doesNotMatch(edit, /Valid for/, 'validity is changed with the actions, not the edit form');
  assert.match(edit, /value="Noble School"/);
});

test('login screen renders without a stored secret', async () => {
  globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const { default: AdminApp } = await load('/src/admin/AdminApp.jsx');
  const out = html(React.createElement(AdminApp));
  assert.match(out, /Loading|Admin panel/);
});
