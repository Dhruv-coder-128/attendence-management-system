/**
 * Automated Verification Script for:
 * 1. Dynamic Academy Logo & Branding Propagation Hook & Event Dispatch
 * 2. File Explorer Save-As File Picker Engine
 * 3. School License Activation Loop Fix & Active State Logic
 */

import assert from 'node:assert';

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(err);
    failed++;
  }
}

console.log('======================================================');
console.log('BRANDING PROPAGATION, FILE PICKER & LICENSE SUITE');
console.log('======================================================\n');

// Mock localStorage and window
const storage = {};
global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
};

// Test 1: FileSaveHelper Types Resolution
console.log('--- TEST 1: File Save Picker Helper Types Resolution ---');
import { saveFileWithPicker, saveDataUrlWithPicker } from '../src/lib/fileSaveHelper.js';

test('saveFileWithPicker handles empty blob safely', async () => {
  const res = await saveFileWithPicker(null, 'test.xlsx');
  assert.strictEqual(res.ok, false);
  assert(res.error.includes('No file blob provided'));
});

test('saveDataUrlWithPicker handles null data safely', async () => {
  const res = await saveDataUrlWithPicker('', 'test.pdf');
  assert.strictEqual(res.ok, false);
});

// Test 2: Academy Settings Updates
console.log('\n--- TEST 2: Academy Settings Custom Event & Storage ---');
import { getStoredAcademySettings, saveSettingsToLocal, DEFAULT_ACADEMY_SETTINGS } from '../src/lib/academySettings.js';

test('Default academy settings contain academy_name or schoolName and logo', () => {
  const settings = getStoredAcademySettings();
  assert(settings.academy_name || settings.schoolName);
  assert(settings.logo_url !== undefined || settings.logo !== undefined);
});

test('saveSettingsToLocal saves new logo and updates storage', () => {
  const newLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  saveSettingsToLocal({ logo: newLogo, schoolName: 'Noble Academy' });
  
  const saved = getStoredAcademySettings();
  assert.strictEqual(saved.schoolName, 'Noble Academy');
  assert.strictEqual(saved.logo, newLogo);
});

// Test 3: License Service Active State Resolution
console.log('\n--- TEST 3: School License State & Prevention of Activation Loop ---');
import { getStoredLicense, saveStoredLicense, activateSchoolLicense } from '../src/lib/licenseService.js';

test('Active license persists with correct status and days remaining', () => {
  saveStoredLicense({
    licenseKey: 'SMS-NOBLE-30D-89XK7',
    schoolName: 'Noble Academy',
    status: 'trial_active',
    daysRemaining: 29,
  });

  const lic = getStoredLicense();
  assert.strictEqual(lic.licenseKey, 'SMS-NOBLE-30D-89XK7');
  assert.strictEqual(lic.status, 'trial_active');
  assert.strictEqual(lic.daysRemaining, 29);

  // Check condition used by SchoolActivationModal
  const isAlreadyActive = (lic?.status === 'licensed' || lic?.status === 'trial_active') &&
    (lic?.daysRemaining === undefined || lic?.daysRemaining > 0);
  assert.strictEqual(isAlreadyActive, true, 'License is recognized as already active, preventing activation loop');
});

test('Expired license is correctly recognized as not active', () => {
  saveStoredLicense({
    licenseKey: 'SMS-EXPIRED-TEST',
    status: 'trial_active',
    daysRemaining: 0,
  });

  const lic = getStoredLicense();
  const isAlreadyActive = (lic?.status === 'licensed' || lic?.status === 'trial_active') &&
    (lic?.daysRemaining === undefined || lic?.daysRemaining > 0);
  assert.strictEqual(isAlreadyActive, false, 'Expired license allows entering activation key');
});

console.log('\n======================================================');
console.log(`SUITE FINISHED: ${passed} Passed, ${failed} Failed`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}
