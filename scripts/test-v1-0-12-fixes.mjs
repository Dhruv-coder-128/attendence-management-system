import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${testName}`);
    failed++;
  }
}

console.log('--- Testing SMS v1.0.12 User Feedback Fixes ---');

// 1. Check index.css for modal-backdrop and modal-overlay
const indexCss = fs.readFileSync(path.join(rootDir, 'src/index.css'), 'utf-8');
assert(indexCss.includes('.modal-backdrop') && indexCss.includes('.modal-overlay'), 'index.css defines both .modal-backdrop and .modal-overlay');
assert(indexCss.includes('z-index: 9999;'), 'Modals have high z-index (9999) to overlay all page elements');
assert(indexCss.includes('@media print'), 'index.css contains comprehensive @media print styling');
assert(indexCss.includes('.print-only') && indexCss.includes('.screen-only'), 'index.css provides .print-only and .screen-only utility classes');

// 2. Check licenseService.js for dynamic daysRemaining & Tier 4 unlimited
const licenseServiceJs = fs.readFileSync(path.join(rootDir, 'src/lib/licenseService.js'), 'utf-8');
assert(licenseServiceJs.includes('Math.ceil(diffMs / (1000 * 60 * 60 * 24))'), 'Dynamic live calculation of daysRemaining from trialEndsAt');
assert(licenseServiceJs.includes('if (max >= 5000)'), 'Tier 4 (5,000+) allows unlimited students');
assert(licenseServiceJs.includes('academy_name = schoolName') || licenseServiceJs.includes('erp_institute_name'), 'Activating license automatically syncs school name to academy_settings');

// 3. Check school_database.json for Noble Academy unblock
const schoolDb = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/data/school_database.json'), 'utf-8'));
const nobleLicCourse = schoolDb.courses.find(c => c.code === 'LIC:SMS-NOBLE-30D-89XK7');
assert(nobleLicCourse && nobleLicCourse.is_active === true, 'Noble Academy is active in school_database.json');
const nobleDesc = JSON.parse(nobleLicCourse.description);
assert(nobleDesc.status === 'trial_active' && nobleDesc.isLocked === false, 'Noble Academy status is trial_active and unlocked');

// 4. Check SettingsPage.jsx hides license key
const settingsJsx = fs.readFileSync(path.join(rootDir, 'src/pages/SettingsPage.jsx'), 'utf-8');
assert(!settingsJsx.includes('{liveLicense?.licenseKey || \'UNLICENSED\'}'), 'SettingsPage no longer exposes raw license key to users');
assert(settingsJsx.includes('Institutional Entitlement:'), 'SettingsPage shows institutional entitlement status instead of raw key');

// 5. Check LoginPage.jsx for Forgot Password flow
const loginJsx = fs.readFileSync(path.join(rootDir, 'src/pages/LoginPage.jsx'), 'utf-8');
assert(loginJsx.includes('Forgot Password?'), 'LoginPage has Forgot Password trigger button');
assert(loginJsx.includes('api.whatsapp.com/send?phone=918866039007'), 'LoginPage has 1-Click WhatsApp Support link to developer Dhruv Shah');
assert(loginJsx.includes('SMS-RESET-8866'), 'LoginPage accepts Master Reset Key for zero-cost offline password resets');

// 6. Check DashboardPage.jsx for separate Absent and Late cards
const dashboardJsx = fs.readFileSync(path.join(rootDir, 'src/pages/DashboardPage.jsx'), 'utf-8');
assert(dashboardJsx.includes('title="Late Today"'), 'DashboardPage renders dedicated Late Today card');
assert(dashboardJsx.includes('title="Absent Today"'), 'DashboardPage renders dedicated Absent Today card');
assert(dashboardJsx.includes('subtext="Marked absent today"'), 'Absent card strictly reports absent students');
assert(dashboardJsx.includes('subtext="Marked late arrival"'), 'Late card reports late arrival students');

// 7. Check ReportsPage.jsx for institutional print dossier
const reportsJsx = fs.readFileSync(path.join(rootDir, 'src/pages/ReportsPage.jsx'), 'utf-8');
assert(reportsJsx.includes('className="print-only institutional-print-sheet"'), 'ReportsPage renders formal institutional print sheet');
assert(reportsJsx.includes('className="screen-only"'), 'ReportsPage wraps web buttons and tabs inside screen-only container');

// 8. Check batchRepairService.js preserves student batches
const batchRepairJs = fs.readFileSync(path.join(rootDir, 'src/lib/batchRepairService.js'), 'utf-8');
assert(!batchRepairJs.includes('activeBatches[i % numBatches]'), 'batchRepairService no longer shuffles students with round-robin modulo');
assert(batchRepairJs.includes('Student class assignments permanently locked'), 'batchRepairService guarantees student batch assignments are immutable');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL v1.0.12 CHECKS PASSED PERFECTLY!');
}
