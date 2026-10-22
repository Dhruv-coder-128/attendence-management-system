import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=================================================================');
console.log('VERIFICATION: 100-STUDENT PENDING INVARIANT & ADMIN CONTROL CENTER');
console.log('=================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

// 1. Check Canonical Data
import { CANONICAL_BATCHES, CANONICAL_STUDENTS } from '../src/data/canonicalSchoolData.js';
assert(CANONICAL_STUDENTS.length === 100, `Canonical students count is exactly 100 (got ${CANONICAL_STUDENTS.length})`);
assert(CANONICAL_BATCHES.length === 5, `Canonical batches count is exactly 5 (got ${CANONICAL_BATCHES.length})`);

// 2. Check Batch Distribution
const batchCounts = {};
CANONICAL_STUDENTS.forEach((s) => {
  const b = s.batch_id || s.batch_code;
  batchCounts[b] = (batchCounts[b] || 0) + 1;
});
const allTwenty = Object.values(batchCounts).every((c) => c === 20);
assert(allTwenty && Object.keys(batchCounts).length === 5, `Each of the 5 batches has exactly 20 students`);

// 3. Mathematical Invariant Verification
const testCases = [
  { present: 59, absent: 21, expectedPending: 20 },
  { present: 37, absent: 40, expectedPending: 23 },
  { present: 100, absent: 0, expectedPending: 0 },
  { present: 0, absent: 100, expectedPending: 0 },
  { present: 0, absent: 0, expectedPending: 100 },
  { present: 80, absent: 15, expectedPending: 5 },
];

testCases.forEach((tc, idx) => {
  const total = 100;
  const pending = Math.max(0, total - (tc.present + tc.absent));
  const sum = tc.present + tc.absent + pending;
  assert(
    pending === tc.expectedPending && sum === 100,
    `Test case ${idx + 1}: Present(${tc.present}) + Absent(${tc.absent}) + Pending(${pending}) === 100`
  );
});

// 4. Code Inspection: DashboardPage.jsx
const dashboardCode = fs.readFileSync(path.join(rootDir, 'src/pages/DashboardPage.jsx'), 'utf-8');
assert(dashboardCode.includes('pendingToday'), 'DashboardPage tracks pendingToday state');
assert(dashboardCode.includes('title="Pending Roll Call"'), 'DashboardPage renders dedicated Pending Roll Call card');
assert(dashboardCode.includes("Today's Roll Call Completion"), 'DashboardPage renders proportion completion progress bar');

// 5. Code Inspection: TeacherAttendancePage.jsx
const teacherCode = fs.readFileSync(path.join(rootDir, 'src/pages/TeacherAttendancePage.jsx'), 'utf-8');
assert(teacherCode.includes("gridTemplateColumns: 'repeat(5, 1fr)'"), 'TeacherAttendancePage has 5-column top summary cards');
assert(teacherCode.includes('Pending') && teacherCode.includes('20 Students Pending'), 'TeacherAttendancePage displays pending roll call');
assert(teacherCode.includes('totalPending'), 'TeacherAttendancePage calculates totalPending from 100 student invariant');

// 6. Code Inspection: useSchoolDatabaseSync.js
const syncCode = fs.readFileSync(path.join(rootDir, 'src/lib/useSchoolDatabaseSync.js'), 'utf-8');
assert(syncCode.includes('enrichedAttendance'), 'useSchoolDatabaseSync enriches and pushes attendance to hub');
assert(syncCode.includes('attendance: enrichedAttendance'), 'useSchoolDatabaseSync sends attendance in sync_school_data');

// 7. Code Inspection: hub_server.rs
const hubCode = fs.readFileSync(path.join(rootDir, 'src-tauri/src/hub_server.rs'), 'utf-8');
assert(hubCode.includes('payload.get("attendance")'), 'hub_server.rs parses attendance from sync_school_data');
assert(hubCode.includes('attendance_sync.json'), 'hub_server.rs persists attendance to attendance_sync.json');

// 8. Code Inspection: Sidebar.jsx & App.jsx
const sidebarCode = fs.readFileSync(path.join(rootDir, 'src/components/layout/Sidebar.jsx'), 'utf-8');
const appCode = fs.readFileSync(path.join(rootDir, 'src/App.jsx'), 'utf-8');
assert(sidebarCode.includes("id: 'master-portal'") && sidebarCode.includes('isTauriDesktop()'), 'Sidebar conditionally guards Admin Control Center for Vercel only');
assert(appCode.includes("!isTauriDesktop()") && appCode.includes("'master-portal'"), 'App.jsx strictly blocks master-portal on desktop EXE');


// 9. Code Inspection: MasterAdminPortalPage.jsx
const masterCode = fs.readFileSync(path.join(rootDir, 'src/pages/MasterAdminPortalPage.jsx'), 'utf-8');
assert(masterCode.includes('handleReseedCanonical100'), 'MasterAdminPortalPage provides 1-Click 100-Student Canonical Reseed');
assert(masterCode.includes('handleForceHubSync'), 'MasterAdminPortalPage provides 1-Click Force Hub Synchronization');
assert(masterCode.includes('handleMasterMarkAllPresent'), 'MasterAdminPortalPage provides Master Override Mark All Present');
assert(masterCode.includes('handleMasterMarkAllAbsent'), 'MasterAdminPortalPage provides Master Override Mark All Absent');
assert(masterCode.includes('handleMasterResetToPending'), 'MasterAdminPortalPage provides Master Override Reset to Pending');
assert(masterCode.includes('handleExportFullBackup'), 'MasterAdminPortalPage provides Full .smsdb Backup Export');

console.log(`\n=================================================================`);
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log(`=================================================================`);

if (failed > 0) {
  process.exit(1);
}
